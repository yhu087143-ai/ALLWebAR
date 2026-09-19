import React, { useState } from 'react';
import {
  Plus, Trash2, Zap, Hand, Timer, Target, Star, Smile,
  Play, Volume2, Sparkles, MessageSquare, Link2, Vibrate,
} from 'lucide-react';

/**
 * Step 3：事件-动作配置器
 *
 * 可视化编辑"当 [触发器] → 执行 [动作]"规则。
 * 用户可添加多条规则组合成 AR 交互逻辑。
 *
 * Props:
 *   events: Array<{ trigger, action, params, target }>
 *   onChange: (events) => void
 */
export default function StepEvents({ events = [], onChange }) {
  const triggerDefs = [
    { id: 'onTap', label: '点击模型', icon: Hand, desc: '用户点击或触摸模型时触发', color: 'indigo' },
    { id: 'onProximityEnter', label: '靠近模型', icon: Zap, desc: '用户走进模型一定距离时触发', color: 'emerald' },
    { id: 'onTrackingFound', label: '追踪到目标', icon: Target, desc: '摄像头首次识别到追踪目标时触发', color: 'cyan' },
    { id: 'onTrackingLost', label: '追踪丢失', icon: Target, desc: '追踪目标丢失时触发', color: 'amber' },
    { id: 'onTimerEnd', label: '倒计时结束', icon: Timer, desc: '游戏倒计时到 0 时触发', color: 'pink' },
    { id: 'onCollect', label: '收集物品', icon: Star, desc: '用户收集到物品时触发', color: 'emerald' },
    { id: 'onBlink', label: '眨眼', icon: Smile, desc: '用户眨眼时触发（仅面部追踪）', color: 'purple' },
    { id: 'onMouthOpen', label: '张嘴', icon: Smile, desc: '用户张嘴时触发（仅面部追踪）', color: 'purple' },
    { id: 'onMouthClose', label: '闭嘴', icon: Smile, desc: '用户闭嘴时触发（仅面部追踪）', color: 'purple' },
  ];

  const actionDefs = [
    { id: 'playAnimation', label: '播放动画', icon: Play, desc: '触发模型动画片段' },
    { id: 'playSound', label: '播放音效', icon: Volume2, desc: '播放音效文件' },
    { id: 'showEffect', label: '显示特效', icon: Sparkles, desc: '粒子爆炸 / 发光 / 消散效果' },
    { id: 'showMessage', label: '显示文字', icon: MessageSquare, desc: '在屏幕上显示提示文字' },
    { id: 'addScore', label: '增加分数', icon: Star, desc: '增加游戏分数' },
    { id: 'link', label: '跳转链接', icon: Link2, desc: '打开指定网页链接' },
    { id: 'triggerVibrate', label: '震动反馈', icon: Vibrate, desc: '触发手机震动' },
  ];

  const addEvent = () => {
    onChange([...events, { trigger: 'onTap', action: 'playAnimation', params: {}, target: '' }]);
  };

  const removeEvent = (index) => {
    onChange(events.filter((_, i) => i !== index));
  };

  const updateEvent = (index, patch) => {
    onChange(events.map((ev, i) => i === index ? { ...ev, ...patch } : ev));
  };

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">设置交互</h2>
        <p className="text-sm text-slate-500">
          定义 AR 体验中的交互规则。当用户触发某个事件时，执行对应的动作。
          多条规则可以组合出复杂的交互逻辑。
        </p>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-dashed border-white/10 flex items-center justify-center mx-auto mb-4">
            <Zap size={24} className="text-slate-500" />
          </div>
          <p className="text-sm text-slate-500 mb-1">尚未添加交互规则</p>
          <p className="text-xs text-slate-600 mb-4">交互规则是可选的，跳过此步也能正常发布</p>
          <button
            onClick={addEvent}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium
              bg-violet-500/10 text-violet-400 border border-violet-500/20
              hover:bg-violet-500/20 transition-all"
          >
            <Plus size={14} />
            添加第一条规则
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev, i) => {
            const triggerDef = triggerDefs.find((t) => t.id === ev.trigger);
            const actionDef = actionDefs.find((a) => a.id === ev.action);
            const TriggerIcon = triggerDef?.icon || Zap;

            return (
              <div key={i} className="glass-card rounded-xl border border-white/[0.06]">
                <div className="p-4">
                  {/* 规则头 */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Zap size={12} className="text-violet-400" />
                      规则 #{i + 1}
                    </span>
                    <button
                      onClick={() => removeEvent(i)}
                      className="text-slate-600 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* 当... */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-16 shrink-0 text-xs text-slate-500 pt-1">当</div>
                    <div className="flex-1">
                      <select
                        value={ev.trigger}
                        onChange={(e) => updateEvent(i, { trigger: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
                      >
                        {triggerDefs.map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-600 mt-1">
                        {triggerDefs.find((t) => t.id === ev.trigger)?.desc || ''}
                      </p>
                    </div>
                  </div>

                  {/* → 执行... */}
                  <div className="flex items-start gap-3">
                    <div className="w-16 shrink-0 text-xs text-slate-500 pt-1">→ 执行</div>
                    <div className="flex-1">
                      <select
                        value={ev.action}
                        onChange={(e) => updateEvent(i, { action: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300"
                      >
                        {actionDefs.map((a) => (
                          <option key={a.id} value={a.id}>{a.label}</option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-600 mt-1">
                        {actionDefs.find((a) => a.id === ev.action)?.desc || ''}
                      </p>

                      {/* 动作参数 */}
                      {ev.action === 'playAnimation' && (
                        <input
                          type="text"
                          value={ev.params.clip || ''}
                          onChange={(e) => updateEvent(i, { params: { ...ev.params, clip: e.target.value } })}
                          placeholder="动画片段名（如: spin）"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 mt-2"
                        />
                      )}
                      {ev.action === 'showMessage' && (
                        <input
                          type="text"
                          value={ev.params.text || ''}
                          onChange={(e) => updateEvent(i, { params: { ...ev.params, text: e.target.value } })}
                          placeholder="显示的提示文字"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 mt-2"
                        />
                      )}
                      {ev.action === 'playSound' && (
                        <input
                          type="url"
                          value={ev.params.src || ''}
                          onChange={(e) => updateEvent(i, { params: { ...ev.params, src: e.target.value } })}
                          placeholder="音效 URL (.mp3)"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 mt-2"
                        />
                      )}
                      {ev.action === 'link' && (
                        <input
                          type="url"
                          value={ev.params.url || ''}
                          onChange={(e) => updateEvent(i, { params: { ...ev.params, url: e.target.value } })}
                          placeholder="https://..."
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 mt-2"
                        />
                      )}
                      {ev.action === 'addScore' && (
                        <input
                          type="number"
                          value={ev.params.amount || 10}
                          onChange={(e) => updateEvent(i, { params: { ...ev.params, amount: parseInt(e.target.value) || 0 } })}
                          placeholder="分数"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 mt-2"
                          min="0"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* 添加按钮 */}
          <button
            onClick={addEvent}
            className="w-full py-3 rounded-xl text-xs font-medium text-slate-500
              border border-dashed border-white/10 hover:border-violet-500/30
              hover:text-violet-400 transition-all flex items-center justify-center gap-1.5"
          >
            <Plus size={14} />
            添加规则
          </button>
        </div>
      )}

      {/* 预设模板 */}
      {events.length === 0 && (
        <div className="mt-6">
          <p className="text-xs text-slate-500 mb-3">快速添加常用组合：</p>
          <div className="flex flex-wrap gap-2">
            {presetTemplates.map((preset, i) => (
              <button
                key={i}
                onClick={() => onChange(preset.events)}
                className="px-3 py-2 rounded-lg text-xs bg-white/[0.03] border border-white/[0.06]
                  hover:bg-white/[0.06] transition-all text-left"
              >
                <p className="text-slate-300 font-medium mb-0.5">{preset.name}</p>
                <p className="text-slate-500 text-[10px]">{preset.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 预设交互模板 */
const presetTemplates = [
  {
    name: '点击切换动画',
    desc: '用户点击模型 → 切换下一个动画',
    events: [
      { trigger: 'onTap', action: 'playAnimation', params: {}, target: '' },
    ],
  },
  {
    name: '点击加分',
    desc: '用户点击模型 → 增加 10 分',
    events: [
      { trigger: 'onTap', action: 'addScore', params: { amount: 10 }, target: '' },
    ],
  },
  {
    name: '追踪 + 欢迎',
    desc: '识别到目标 → 显示欢迎文字',
    events: [
      { trigger: 'onTrackingFound', action: 'showMessage', params: { text: '欢迎！' }, target: '' },
    ],
  },
  {
    name: '收集反馈',
    desc: '收集物品 → 加分 + 特效 + 音效',
    events: [
      { trigger: 'onCollect', action: 'addScore', params: { amount: 10 }, target: '' },
      { trigger: 'onCollect', action: 'showEffect', params: { type: 'sparkle' }, target: '' },
      { trigger: 'onCollect', action: 'playSound', params: {}, target: '' },
    ],
  },
  {
    name: '游戏收集',
    desc: '收集物品 → 加分 + 特效 + 音效',
    events: [
      { trigger: 'onCollect', action: 'addScore', params: { amount: 10 }, target: '' },
      { trigger: 'onCollect', action: 'showEffect', params: { type: 'sparkle' }, target: '' },
      { trigger: 'onCollect', action: 'playSound', params: {}, target: '' },
    ],
  },
  {
    name: '靠近触发',
    desc: '用户靠近 → 显示消息 + 播放动画',
    events: [
      { trigger: 'onProximityEnter', action: 'showMessage', params: { text: '欢迎来到 AR 世界！' }, target: '' },
      { trigger: 'onProximityEnter', action: 'playAnimation', params: { clip: 'idle' }, target: '' },
    ],
  },
  {
    name: '点击跳转',
    desc: '点击模型 → 打开指定链接',
    events: [
      { trigger: 'onTap', action: 'link', params: { url: 'https://' }, target: '' },
    ],
  },
  {
    name: '倒计时结束',
    desc: '倒计时归零 → 显示结束文字',
    events: [
      { trigger: 'onTimerEnd', action: 'showMessage', params: { text: '时间到！' }, target: '' },
    ],
  },
  {
    name: '眨眼触发',
    desc: '用户眨眼 → 播放音效',
    events: [
      { trigger: 'onBlink', action: 'playSound', params: {}, target: '' },
    ],
  },
  {
    name: '张嘴特效',
    desc: '张嘴 → 显示特效',
    events: [
      { trigger: 'onMouthOpen', action: 'showEffect', params: {}, target: '' },
    ],
  },
];
