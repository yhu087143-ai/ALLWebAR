import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Check, AlertCircle, ArrowLeft } from 'lucide-react';
import SemanticIcon from '../icons/SemanticIcon.jsx';
import ModelUploader from '../ModelUploader.jsx';
import { uploadTargetImage } from '../../api/client.js';
import FaceContent from './FaceContent.jsx';

/**
 * Step 2：内容配置面板
 *
 * 为每个选中的能力独立配置内容。
 * 不同的追踪类型显示不同的配置项。
 *
 * Props:
 *   capabilities: string[]              — 选中的能力列表
 *   content: object                     — 各能力的内容配置
 *   onChange: (capId, data) => void     — 某个能力的内容变更
 */
export default function StepContent({ capabilities = [], content = {}, onChange, onBackToCapabilities }) {
  if (!capabilities || capabilities.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-dashed border-white/10 flex items-center justify-center mx-auto mb-4">
          <Upload size={24} className="text-slate-500" />
        </div>
        <p className="text-sm text-slate-500 mb-1">尚未选择任何能力</p>
        <p className="text-xs text-slate-600 mb-4">请先选择一项 AR 能力，然后为此能力配置内容</p>
        <button
          onClick={onBackToCapabilities}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium
            bg-violet-500/10 text-violet-400 border border-violet-500/20
            hover:bg-violet-500/20 transition-all"
        >
          <ArrowLeft size={14} />
          返回选择能力
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">配置内容</h2>
        <p className="text-sm text-slate-500">
          为每项选中的能力配置对应的 3D 模型或图片内容
        </p>
      </div>

      <div className="space-y-5">
        {capabilities.map((capId, i) => (
          <CapabilityContent
            key={capId}
            capId={capId}
            index={i}
            data={content[capId] || {}}
            onChange={(data) => onChange(capId, data)}
          />
        ))}
      </div>
    </div>
  );
}

/** 单个能力的内容配置 */
function CapabilityContent({ capId, index, data, onChange }) {
  const capMeta = {
    image: { label: '图片追踪', icon: 'picture', color: 'border-violet-500/20' },
    face: { label: '面部追踪', icon: 'smile', color: 'border-violet-500/20' },
    plane: { label: '平面放置', icon: 'package', color: 'border-emerald-500/20' },
    world: { label: '空间定位', icon: 'globe', color: 'border-cyan-500/20' },
  }[capId] || { label: capId, icon: 'pin', color: 'border-slate-500/20' };

  return (
    <div className={`glass-card rounded-xl border ${capMeta.color}`}>
      <div className="p-5">
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-4">
          <SemanticIcon name={capMeta.icon} size={18} />
          <span className="text-sm font-medium text-slate-200">{capMeta.label}</span>
          <span className="text-[10px] text-slate-600 ml-auto">步骤 2 · {index + 1}/{index + 1}</span>
        </div>

        {/* 各能力的具体配置 */}
        {capId === 'image' && (
          <ImageContent data={data} onChange={onChange} />
        )}
        {capId === 'face' && (
          <FaceContent data={data} onChange={onChange} />
        )}
        {(capId === 'plane' || capId === 'world') && (
          <ModelOrVideoContent capId={capId} data={data} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

/** 图片追踪配置 */
function ImageContent({ data, onChange }) {
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState('');
  const fileInputRef = useRef(null);

  const update = (patch) => onChange({ ...data, ...patch });

  const handleFileSelect = async (file) => {
    if (!file) return;
    setCompiling(true);
    setCompileError('');
    update({ targetImageFile: file, targetPreview: URL.createObjectURL(file) });
    try {
      const result = await uploadTargetImage(file);
      update({ targetUrl: result.targetUrl, targetImageUrl: result.imageUrl, compiled: true });
    } catch (err) {
      setCompileError(err.message || '编译失败');
    } finally {
      setCompiling(false);
    }
  };

  // 释放上一个 blob URL
  useEffect(() => {
    return () => {
      if (data.targetPreview && data.targetPreview.startsWith('blob:')) {
        URL.revokeObjectURL(data.targetPreview);
      }
    };
  }, [data.targetPreview]);

  return (
    <div>
      {!data.compiled ? (
        <div>
          <label className="flex flex-col items-center justify-center w-full h-32 rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] cursor-pointer hover:border-violet-500/40 hover:bg-white/[0.05] transition-all duration-200">
            <div className="flex flex-col items-center gap-2">
              {compiling ? (
                <>
                  <div className="w-6 h-6 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                  <span className="text-xs text-slate-500">编译中...</span>
                </>
              ) : (
                <>
                  <Upload size={20} className="text-slate-500" />
                  <span className="text-xs text-slate-500">点击选择目标图片</span>
                  <span className="text-[10px] text-slate-600">PNG, JPG, WebP</span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={compiling}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            />
          </label>
          {compileError && <p className="text-xs text-rose-400 mt-2">{compileError}</p>}
        </div>
      ) : (
        <div>
          <div className="relative rounded-xl overflow-hidden border border-white/10">
            <img src={data.targetPreview} alt="目标图片" className="w-full h-40 object-cover" />
            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs">
              <Check size={12} />
              编译完成
            </div>
          </div>
          <button
            onClick={() => {
              if (data.targetPreview?.startsWith('blob:')) URL.revokeObjectURL(data.targetPreview);
              onChange({});
            }}
            className="text-xs text-slate-500 hover:text-rose-400 mt-2 transition-colors"
          >
            更换图片
          </button>
        </div>
      )}
      <p className="text-xs text-slate-600 mt-2">
        上传目标图片，用户扫描该图片即可触发 AR 体验
      </p>

      {/* 叠加 3D 模型（支持 URL 或上传） */}
      <div className="mt-3">
        <label className="text-xs text-slate-500 mb-2 block">叠加 3D 模型</label>
        {/* 来源切换：URL / 上传 */}
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => update({ modelSource: 'url' })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              (data.modelSource || 'url') === 'url'
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                : 'bg-white/5 text-slate-400 border border-white/5'
            }`}
          >
            输入 URL
          </button>
          <button
            onClick={() => update({ modelSource: 'upload' })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              data.modelSource === 'upload'
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                : 'bg-white/5 text-slate-400 border border-white/5'
            }`}
          >
            上传文件
          </button>
        </div>
        {(data.modelSource || 'url') === 'url' ? (
          <ContentUrlInput label="" url={data.modelUrl || ''} onChange={(v) => update({ modelUrl: v })} placeholder="https://.../model.glb" accept="model" />
        ) : (
          <ModelUploader onUploadComplete={(url) => update({ modelUrl: url, modelSource: 'upload' })} />
        )}
      </div>
      <ScaleSlider value={data.scale || 1} onChange={(v) => update({ scale: v })} />
    </div>
  );
}

/** 模型 or 视频内容配置（平面/世界共用） */
function ModelOrVideoContent({ capId, data, onChange }) {
  const update = (patch) => onChange({ ...data, ...patch });
  const modelSource = data.modelSource || 'url';

  const hintText = capId === 'plane'
    ? '用户扫描到平面后点击放置该内容'
    : '内容固定在真实世界位置，用户可从不同角度查看';

  return (
    <div>
      {/* URL / Upload */}
      <div>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => update({ modelSource: 'url' })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              modelSource === 'url'
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                : 'bg-white/5 text-slate-400 border border-white/5'
            }`}
          >
            输入 URL
          </button>
          <button
            onClick={() => update({ modelSource: 'upload' })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              modelSource === 'upload'
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                : 'bg-white/5 text-slate-400 border border-white/5'
            }`}
          >
            上传文件
          </button>
        </div>
        {modelSource === 'url' ? (
          <ContentUrlInput
            label=""
            url={data.modelUrl || ''}
            onChange={(v) => update({ modelUrl: v })}
            placeholder="https://.../model.glb"
            accept="model"
          />
        ) : (
          <ModelUploader onUploadComplete={(url) => update({ modelUrl: url, modelSource: 'upload' })} />
        )}
      </div>

      <ScaleSlider value={data.scale || 1} onChange={(v) => update({ scale: v })} />
      <p className="text-xs text-slate-600 mt-2">{hintText}</p>
    </div>
  );
}

/** 通用 URL 输入 */
function ContentUrlInput({ label, url, onChange, placeholder, accept }) {
  return (
    <div className="mb-3">
      {label && <label className="text-xs text-slate-500 mb-1 block">{label}</label>}
      <input
        type="url"
        value={url}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-xs"
      />
    </div>
  );
}

/** 缩放滑块 */
function ScaleSlider({ value, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500">缩放</span>
        <span className="text-xs text-slate-400">{value.toFixed(1)}x</span>
      </div>
      <input
        type="range"
        min="0.1"
        max="3"
        step="0.1"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full appearance-none bg-white/10 cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400"
      />
    </div>
  );
}
