import React from 'react';
import { Smartphone, Camera, Move3d, ExternalLink } from 'lucide-react';

/**
 * AR 配置预览组件
 *
 * 在创建页右侧展示当前配置的摘要信息。
 * 实际的 AR 体验在 /view/:id 页面使用 @ar-platform/engine 运行。
 *
 * @param {{ modelUrl: string, trackingType: string, scale?: number }} props
 */
export default function ArViewer({ modelUrl, trackingType, scale }) {
  const trackingTypeLabels = {
    plane: '平面追踪 (Plane Tracking)',
    image: '图片追踪 (Image Tracking)',
    face: '面部追踪 (Face Tracking)',
  };

  const trackingIcons = {
    plane: Move3d,
    image: Camera,
    face: Smartphone,
  };

  const Icon = trackingIcons[trackingType] || Smartphone;

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      {/* 预览区域 */}
      <div className="relative aspect-[4/3] bg-ar-mid flex items-center justify-center overflow-hidden">
        {/* 装饰性网格背景 */}
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              'linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px)',
            backgroundSize: '30px 30px',
          }}
        />

        {/* 中心内容 */}
        <div className="relative z-10 flex flex-col items-center gap-3 text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Icon size={32} className="text-violet-400/60" />
          </div>
          <div>
            <p className="text-slate-300 text-sm font-medium mb-1">
              {trackingTypeLabels[trackingType] || 'AR 体验'}
            </p>
            <p className="text-slate-500 text-xs">
              发布后在手机端打开链接即可体验
            </p>
          </div>
        </div>

        {/* 角落标签 */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <Smartphone size={14} className="text-violet-400/50" />
          <span className="text-xs text-violet-400/50">移动端 AR</span>
        </div>
      </div>

      {/* 配置信息面板 */}
      <div className="p-4 space-y-2 border-t border-white/5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">追踪类型</span>
          <span className="text-slate-300 font-medium">
            {trackingTypeLabels[trackingType] || trackingType}
          </span>
        </div>
        {scale && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">缩放比例</span>
            <span className="text-slate-300 font-medium">{scale}x</span>
          </div>
        )}
        {modelUrl && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">模型地址</span>
            <span className="text-slate-400 truncate max-w-[200px] text-right" title={modelUrl}>
              {modelUrl}
            </span>
          </div>
        )}
        <div className="pt-2">
          <a
            href="#"
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs
              bg-violet-500/5 text-violet-400/70 hover:bg-violet-500/10 hover:text-violet-400
              transition-colors"
            onClick={(e) => {
              e.preventDefault();
            }}
          >
            <ExternalLink size={12} />
            发布后获得 AR 链接
          </a>
        </div>
      </div>
    </div>
  );
}
