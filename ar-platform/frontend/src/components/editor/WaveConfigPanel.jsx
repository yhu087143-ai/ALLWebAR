import React, { useState } from 'react';
import {
  Waves, Plus, Trash2, ChevronDown, ChevronRight,
  Clock, Sword, MapPin, Gauge,
} from 'lucide-react';

/**
 * WaveConfigPanel - 波次管理系统配置
 *
 * Props:
 *   waves: WaveConfig | undefined
 *   onChange: (waves: WaveConfig | undefined) => void
 */
export default function WaveConfigPanel({ waves, onChange }) {
  const enabled = waves?.enabled ?? false;

  const defaults = {
    enabled: false,
    waves: [],
    timeBetweenWaves: 5,
    autoStart: true,
  };

  const config = { ...defaults, ...(waves || {}) };
  const [openWaveId, setOpenWaveId] = useState(null);

  const toggle = () => {
    if (enabled) {
      onChange(undefined);
    } else {
      onChange({ ...defaults, enabled: true });
    }
  };

  const update = (patch) => {
    onChange({ ...config, ...patch });
  };

  const addWave = () => {
    const newWave = {
      id: `wave_${Date.now()}`,
      name: `第 ${config.waves.length + 1} 波`,
      enemies: [{ entityId: 'enemy_1', modelUrl: '', count: 5, spawnPosition: 'random_edge', health: 100, speed: 1, reward: 10 }],
      spawnInterval: 1.5,
      trigger: 'time',
      triggerValue: undefined,
    };
    update({ waves: [...config.waves, newWave] });
  };

  const updateWave = (index, patch) => {
    const updated = [...config.waves];
    updated[index] = { ...updated[index], ...patch };
    update({ waves: updated });
  };

  const removeWave = (index) => {
    const updated = config.waves.filter((_, i) => i !== index);
    update({ waves: updated });
  };

  const addEnemy = (waveIndex) => {
    const wave = { ...config.waves[waveIndex] };
    wave.enemies = [
      ...wave.enemies,
      { entityId: `enemy_${wave.enemies.length + 1}`, modelUrl: '', count: 3, spawnPosition: 'random_edge', health: 100, speed: 1, reward: 10 },
    ];
    updateWave(waveIndex, { enemies: wave.enemies });
  };

  const updateEnemy = (waveIndex, enemyIndex, patch) => {
    const wave = { ...config.waves[waveIndex] };
    wave.enemies = wave.enemies.map((e, i) => i === enemyIndex ? { ...e, ...patch } : e);
    updateWave(waveIndex, { enemies: wave.enemies });
  };

  const removeEnemy = (waveIndex, enemyIndex) => {
    const wave = { ...config.waves[waveIndex] };
    wave.enemies = wave.enemies.filter((_, i) => i !== enemyIndex);
    updateWave(waveIndex, { enemies: wave.enemies });
  };

  const Label = ({ children }) => (
    <label className="block text-xs text-slate-500 mb-1">{children}</label>
  );

  const NumberInput = ({ value, onChange, min, max, step = 1 }) => (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      min={min}
      max={max}
      step={step}
      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-violet-500/40 transition-colors"
    />
  );

  const TextInput = ({ value, onChange, placeholder }) => (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40 transition-colors"
    />
  );

  const Select = ({ value, onChange, options }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-violet-500/40 transition-colors"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );

  const Slider = ({ value, onChange, min, max, step = 1, unit = '' }) => (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-violet-500
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400
            [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-violet-500/30"
        />
      </div>
      <span className="text-xs text-slate-400 min-w-[40px] text-right">{value}{unit}</span>
    </div>
  );

  return (
    <div className="animate-fade-up">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">波次管理系统</h2>
        <p className="text-sm text-slate-500">
          为僵尸生存/塔防类游戏提供多波次敌人生成、节奏控制和进度追踪
        </p>
      </div>

      <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-lg border border-white/[0.06] mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
            <Waves size={16} className="text-rose-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300">启用波次</p>
            <p className="text-xs text-slate-500">按波次自动生成敌人</p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          className={`relative w-10 rounded-full transition-colors duration-200 ${enabled ? 'bg-violet-500' : 'bg-white/20'}`}
          style={{ height: '22px', width: '40px' }}
        >
          <div
            className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white transition-transform duration-200 shadow ${
              enabled ? 'translate-x-[18px]' : ''
            }`}
          />
        </button>
      </div>

      {enabled && (
        <>
          {/* 全局设置 */}
          <div className="bg-white/[0.02] rounded-lg border border-white/[0.06] p-4 mb-3 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="mb-0">波次间隔（秒）</Label>
                <span className="text-xs text-slate-400">{config.timeBetweenWaves}s</span>
              </div>
              <Slider value={config.timeBetweenWaves} onChange={(v) => update({ timeBetweenWaves: Math.max(1, Math.min(120, v)) })} min={1} max={120} unit="s" />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">自动开始</p>
                <p className="text-[10px] text-slate-600 mt-0.5">启动后立即开始第一波</p>
              </div>
              <button
                type="button"
                onClick={() => update({ autoStart: !config.autoStart })}
                className={`relative w-10 rounded-full transition-colors duration-200 ${config.autoStart ? 'bg-violet-500' : 'bg-white/20'}`}
                style={{ height: '22px', width: '40px' }}
              >
                <div
                  className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white transition-transform duration-200 shadow ${
                    config.autoStart ? 'translate-x-[18px]' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 波次列表 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">
                波次 ({config.waves.length})
              </p>
              <button
                type="button"
                onClick={addWave}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                  bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-all"
              >
                <Plus size={12} />
                添加波次
              </button>
            </div>

            {config.waves.length === 0 && (
              <div className="text-center py-8 bg-white/[0.02] rounded-lg border border-white/[0.06]">
                <Waves size={24} className="text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-600">暂无波次，点击上方按钮添加</p>
              </div>
            )}

            {config.waves.map((wave, wi) => (
              <div key={wave.id} className="bg-white/[0.02] rounded-lg border border-white/[0.06] overflow-hidden">
                {/* Wave Header */}
                <div className="flex items-center justify-between p-3">
                  <button
                    type="button"
                    onClick={() => setOpenWaveId(openWaveId === wave.id ? null : wave.id)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <div className="w-6 h-6 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                      <Sword size={12} className="text-rose-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-300">{wave.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {wave.enemies.reduce((s, e) => s + e.count, 0)} 个敌人 · {wave.spawnInterval}s 间隔
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => removeWave(wi)}
                      className="w-6 h-6 rounded-lg bg-white/[0.03] flex items-center justify-center hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenWaveId(openWaveId === wave.id ? null : wave.id)}
                      className="text-slate-600 hover:text-slate-400"
                    >
                      {openWaveId === wave.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </div>
                </div>

                {/* Wave Body */}
                {openWaveId === wave.id && (
                  <div className="px-3 pb-3 space-y-3 animate-fade-up">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>波次名称</Label>
                        <TextInput value={wave.name} onChange={(v) => updateWave(wi, { name: v })} />
                      </div>
                      <div>
                        <Label>触发方式</Label>
                        <Select
                          value={wave.trigger}
                          onChange={(v) => updateWave(wi, { trigger: v })}
                          options={[
                            { value: 'time', label: '时间间隔' },
                            { value: 'previous_wave_complete', label: '上一波完成' },
                            { value: 'expression', label: '表达式触发' },
                          ]}
                        />
                      </div>
                    </div>
                    {wave.trigger === 'time' && (
                      <div>
                        <Label>触发延迟（秒）</Label>
                        <NumberInput value={wave.triggerValue || 0} onChange={(v) => updateWave(wi, { triggerValue: v })} min={0} max={300} />
                      </div>
                    )}
                    {wave.trigger === 'expression' && (
                      <div>
                        <Label>触发表达式</Label>
                        <TextInput
                          value={wave.triggerValue || ''}
                          onChange={(v) => updateWave(wi, { triggerValue: v })}
                          placeholder="score > 500"
                        />
                        <p className="text-[10px] text-slate-600 mt-1">可用变量: score, timer, items, combo</p>
                      </div>
                    )}

                    <div>
                      <Label>生成间隔（秒）</Label>
                      <Slider value={wave.spawnInterval} onChange={(v) => updateWave(wi, { spawnInterval: Math.max(0.1, Math.min(30, v)) })} min={0.1} max={30} unit="s" />
                    </div>

                    {/* Enemies */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-slate-500">敌人类型</p>
                        <button
                          type="button"
                          onClick={() => addEnemy(wi)}
                          className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                        >
                          + 添加敌人
                        </button>
                      </div>
                      {wave.enemies.map((enemy, ei) => (
                        <div key={ei} className="bg-black/20 rounded-lg p-3 mb-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-400">{enemy.entityId}</span>
                            <button
                              type="button"
                              onClick={() => removeEnemy(wi, ei)}
                              className="text-slate-600 hover:text-rose-400 transition-colors"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label>模型 URL</Label>
                              <TextInput
                                value={enemy.modelUrl}
                                onChange={(v) => updateEnemy(wi, ei, { modelUrl: v })}
                                placeholder="/models/enemy.glb"
                              />
                            </div>
                            <div>
                              <Label>数量</Label>
                              <NumberInput
                                value={enemy.count}
                                onChange={(v) => updateEnemy(wi, ei, { count: Math.max(1, Math.min(100, v)) })}
                                min={1}
                                max={100}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <Label>生命值</Label>
                              <NumberInput
                                value={enemy.health}
                                onChange={(v) => updateEnemy(wi, ei, { health: Math.max(1, v) })}
                                min={1}
                                max={10000}
                              />
                            </div>
                            <div>
                              <Label>速度</Label>
                              <NumberInput
                                value={enemy.speed}
                                onChange={(v) => updateEnemy(wi, ei, { speed: Math.max(0.1, Math.min(100, v)) })}
                                min={0.1}
                                max={100}
                                step={0.1}
                              />
                            </div>
                            <div>
                              <Label>奖励分数</Label>
                              <NumberInput
                                value={enemy.reward}
                                onChange={(v) => updateEnemy(wi, ei, { reward: Math.max(0, v) })}
                                min={0}
                                max={9999}
                              />
                            </div>
                          </div>
                          <div>
                            <Label>生成位置</Label>
                            <Select
                              value={typeof enemy.spawnPosition === 'string' ? enemy.spawnPosition : 'random_edge'}
                              onChange={(v) => updateEnemy(wi, ei, { spawnPosition: v })}
                              options={[
                                { value: 'random_edge', label: '随机边缘' },
                                { value: 'grid_edge', label: '网格边缘' },
                                { value: 'custom', label: '自定义坐标' },
                              ]}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* 提示信息 */}
      {enabled && (
        <div className="mt-4 rounded-lg bg-rose-500/5 border border-rose-500/10 p-3">
          <div className="flex items-start gap-2">
            <Gauge size={14} className="text-rose-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-rose-300 font-medium">波次机制说明</p>
              <p className="text-[11px] text-rose-300/60 mt-1">
                每波敌人按设定的间隔依次生成。当一波的所有敌人生成完毕后，经过"波次间隔"时间自动进入下一波。
                所有波次完成后触发 allWavesComplete 事件。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
