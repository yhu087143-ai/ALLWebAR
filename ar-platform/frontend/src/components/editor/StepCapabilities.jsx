import React from 'react';
import { Image, Smile, Box, Globe, MapPin, Check } from 'lucide-react';

/**
 * Step 1：能力选择面板
 *
 * 用户在此步骤中选择需要哪些 AR 能力（可多选），
 * 每个选中能力的含义：
 *   - image     → 图片追踪（扫图触发）
 *   - face      → 面部追踪（面部特效）
 *   - plane     → 平面检测（放在桌面/地面）
 *   - world     → 空间定位（6DoF 悬空放置）
 *   - gps       → GPS 位置触发（旅游导览）
 *   - game      → 小游戏模式
 *
 * Props:
 *   selected: string[]          — 当前选中的能力列表
 *   onChange: (ids: string[])   — 选择变化回调
 */
export default function StepCapabilities({ selected = [], onChange }) {
  const capabilities = [
    {
      id: 'image',
      label: '图片追踪',
      desc: '识别图片叠加内容',
      icon: Image,
      color: 'indigo',
      longDesc: '用户扫描海报、产品图等图片触发 AR 内容显示',
    },
    {
      id: 'face',
      label: '面部追踪',
      desc: '面部识别与特效',
      icon: Smile,
      color: 'purple',
      longDesc: '在面部位置叠加 3D 模型或特效，支持多区域组合',
    },
    {
      id: 'plane',
      label: '平面放置',
      desc: '放在桌面/地面展示',
      icon: Box,
      color: 'emerald',
      longDesc: '检测水平或垂直平面，点击放置 3D 模型在真实空间',
    },
    {
      id: 'world',
      label: '空间定位',
      desc: '6DoF 空间位置固定',
      icon: Globe,
      color: 'cyan',
      longDesc: '模型固定在真实世界位置，用户走动可从不同角度观看',
    },
    {
      id: 'gps',
      label: 'GPS 位置触发',
      desc: '到达位置自动触发',
      icon: MapPin,
      color: 'amber',
      longDesc: '用户到达指定 GPS 坐标附近时自动触发 AR 内容',
      comingSoon: true,
    },
  ];

  const isSelected = (id) => selected.includes(id);

  const toggle = (id) => {
    if (id === 'gps') return; // 暂不可用
    if (isSelected(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const colorMap = {
    indigo: { bg: 'from-violet-500/20 via-violet-500/10', border: 'border-violet-500/30', ring: 'ring-violet-500/20', text: 'text-violet-300', icon: 'text-violet-400' },
    purple: { bg: 'from-violet-500/20 via-violet-500/10', border: 'border-violet-500/30', ring: 'ring-violet-500/20', text: 'text-violet-300', icon: 'text-violet-400' },
    emerald: { bg: 'from-emerald-500/20 via-emerald-500/10', border: 'border-emerald-500/30', ring: 'ring-emerald-500/20', text: 'text-emerald-300', icon: 'text-emerald-400' },
    cyan: { bg: 'from-cyan-500/20 via-cyan-500/10', border: 'border-cyan-500/30', ring: 'ring-cyan-500/20', text: 'text-cyan-300', icon: 'text-cyan-400' },
    amber: { bg: 'from-amber-500/20 via-amber-500/10', border: 'border-amber-500/30', ring: 'ring-amber-500/20', text: 'text-amber-300', icon: 'text-amber-400' },
  };

  return (
    <div className="animate-fade-up">
      {/* 引导提示 */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">选择 AR 能力</h2>
        <p className="text-sm text-slate-500">
          选择您的 AR 体验需要的追踪能力和交互方式，可多选组合。
          例如"图片追踪 + 平面放置"可以让用户先扫图片，再在桌面上查看 3D 模型。
        </p>
      </div>

      {/* 能力卡片网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {capabilities.map((cap) => {
          const Icon = cap.icon;
          const sel = isSelected(cap.id);
          const colors = colorMap[cap.color];

          return (
            <button
              key={cap.id}
              onClick={() => toggle(cap.id)}
              disabled={cap.comingSoon}
              className={`relative text-left p-4 rounded-xl transition-all duration-200 active:scale-[0.98] ${
                sel
                  ? `bg-gradient-to-br ${colors.bg} ${colors.border} border ring-1 ${colors.ring}`
                  : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12]'
              } ${cap.comingSoon ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {/* 选中勾 - 缩放动画 */}
              <div className={`absolute top-3 right-3 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center transition-all duration-300 ease-out ${
                sel ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
              }`}>
                <Check size={12} className="text-white" />
              </div>

              {/* 图标 */}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                sel ? `bg-white/10 ${colors.icon}` : 'bg-white/[0.04] text-slate-500'
              }`}>
                <Icon size={20} />
              </div>

              {/* 标签 */}
              <p className={`text-sm font-medium mb-0.5 ${sel ? colors.text : 'text-slate-300'}`}>
                {cap.label}
              </p>
              <p className="text-xs text-slate-500 mb-2">{cap.desc}</p>
              <p className="text-[11px] text-slate-600/80 leading-relaxed">{cap.longDesc}</p>

              {/* coming soon 标签 */}
              {cap.comingSoon && (
                <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400/70 border border-amber-500/20">
                  即将推出
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 已选摘要 */}
      {selected.length > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-violet-500/5 border border-violet-500/10">
          <p className="text-xs text-slate-400">
            已选择 <span className="text-violet-400 font-medium">{selected.length}</span> 项能力：
            {selected.map((id) => {
              const cap = capabilities.find((c) => c.id === id);
              return cap ? (
                <span key={id} className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded text-xs bg-violet-500/10 text-violet-300">
                  <cap.icon size={10} />
                  {cap.label}
                </span>
              ) : null;
            })}
          </p>
          <p className="text-[11px] text-slate-600 mt-1">
            接下来将为每个选中的能力配置具体内容
          </p>
        </div>
      )}

      {/* 未选的提示 */}
      {selected.length === 0 && (
        <p className="text-xs text-slate-600 text-center mt-4">
          请至少选择一项能力以继续
        </p>
      )}
    </div>
  );
}
