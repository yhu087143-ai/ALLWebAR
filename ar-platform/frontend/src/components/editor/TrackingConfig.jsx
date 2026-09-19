import React, { useState, useRef, useCallback } from 'react';
import { Upload, Image, CheckCircle, X, File, Smile, Box, Globe, Target } from 'lucide-react';
import { uploadTargetImage } from '../../api/client.js';

/**
 * 追踪模块配置 — 文件导入与参数编辑
 *
 * 为每种追踪类型提供对应的文件上传和参数配置界面：
 * - image: 目标图片上传 + .mind 编译
 * - face: 面部特征点配置
 * - plane: 平面检测模式
 * - world: 世界追踪配置
 *
 * @param {{ tracking: string, targetUrl: string, targetImageUrl: string, onUpdate: (field, value) => void }} props
 */
export default function TrackingConfig({ tracking, targetUrl, targetImageUrl, faceFeature, faceScale, planeMode, onUpdate }) {
  const inputRef = useRef(null);
  const blobUrlRef = useRef(null);

  // 组件卸载时释放 blob URL
  React.useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  // ── Image tracking: target image upload ──
  const [uploadState, setUploadState] = useState('idle'); // idle | uploading | done | error
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState(targetImageUrl || '');

  const doUpload = useCallback(async (file) => {
    setUploadState('uploading');
    setProgress(0);
    setErrorMsg('');

    const validExts = ['png', 'jpg', 'jpeg', 'webp'];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!validExts.includes(ext)) {
      setUploadState('error');
      setErrorMsg(`不支持的文件格式 (.${ext})，仅支持 ${validExts.join(', ')}`);
      return;
    }

    // 释放旧 blob URL 再创建新的
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const localUrl = URL.createObjectURL(file);
    blobUrlRef.current = localUrl;
    setPreviewUrl(localUrl);

    try {
      const result = await uploadTargetImage(file, (pct) => {
        setProgress(Math.round(pct * 100));
      });

      setUploadState('done');
      setProgress(100);
      if (result.imageUrl) onUpdate('targetImageUrl', result.imageUrl);
      if (result.targetUrl) onUpdate('targetUrl', result.targetUrl);
    } catch (err) {
      setUploadState('error');
      setErrorMsg(err.message || '上传编译失败');
      URL.revokeObjectURL(localUrl);
      blobUrlRef.current = null;
      setPreviewUrl(targetImageUrl || '');
    }
  }, [onUpdate, targetImageUrl]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) doUpload(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) doUpload(file);
  };

  const handleReset = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setUploadState('idle');
    setProgress(0);
    setErrorMsg('');
    setPreviewUrl('');
    onUpdate('targetImageUrl', '');
    onUpdate('targetUrl', '');
  };

  const renderImageUpload = () => (
    <div className="mt-3 space-y-3">
      <label className="block text-xs font-medium text-slate-400">
        目标图片 <span className="text-slate-600 font-normal">— 上传后将自动编译为 .mind 追踪文件</span>
      </label>

      {uploadState === 'done' && targetUrl ? (
        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
          <div className="flex items-start gap-3">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="target preview"
                className="w-16 h-16 rounded-lg object-cover border border-white/10 shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle size={14} />
                <span className="font-medium">编译完成</span>
              </div>
              <div className="mt-1.5 space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 shrink-0">图片:</span>
                  <span className="text-slate-400 truncate">{targetImageUrl || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 shrink-0">追踪文件:</span>
                  <code className="text-violet-400 truncate">{targetUrl}</code>
                </div>
              </div>
              <button
                onClick={handleReset}
                className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                重新上传
              </button>
            </div>
          </div>
        </div>
      ) : uploadState === 'uploading' ? (
        <div className="p-4 rounded-lg bg-white/[0.02] border border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <File size={18} className="text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400">正在上传并编译...</p>
              <div className="mt-2 w-full h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-violet-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-600 mt-1">{progress}%</p>
            </div>
          </div>
        </div>
      ) : uploadState === 'error' ? (
        <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/20">
          <div className="flex items-center gap-2">
            <X size={14} className="text-rose-400 shrink-0" />
            <p className="text-xs text-rose-400 flex-1">{errorMsg}</p>
            <button
              onClick={handleReset}
              className="text-xs text-violet-400 hover:text-violet-300 whitespace-nowrap"
            >
              重试
            </button>
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          role="button"
          tabIndex={0}
          className="p-4 rounded-lg border border-dashed border-white/10 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] hover:border-white/20 transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-violet-500/5 flex items-center justify-center">
              <Upload size={16} className="text-violet-400/60" />
            </div>
            <p className="text-xs text-slate-500">
              点击或拖拽上传目标图片
            </p>
            <p className="text-[10px] text-slate-600">
              支持 PNG / JPG / WebP，将自动编译为 AR 追踪文件
            </p>
          </div>
        </div>
      )}

      {/* 手动输入 URL 备选 */}
      {uploadState !== 'done' && (
        <div>
          <label className="block text-xs text-slate-500 mb-1">或手动输入 .mind 文件路径</label>
          <input
            type="text"
            value={targetUrl || ''}
            onChange={(e) => onUpdate('targetUrl', e.target.value)}
            placeholder="/targets/default.mind"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 placeholder:text-slate-600
              focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/30"
          />
        </div>
      )}
    </div>
  );

  // ── Face tracking config ──
  const renderFaceConfig = () => (
    <div className="mt-3 space-y-3">
      <label className="block text-xs font-medium text-slate-400">面部追踪参数</label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">面部特征点</label>
          <select
            value={faceFeature ?? '0'}
            onChange={(e) => onUpdate('faceFeature', e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300
              focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/30"
          >
            <option value="0">鼻尖 (0)</option>
            <option value="1">额头中心 (1)</option>
            <option value="2">左眼 (2)</option>
            <option value="3">右眼 (3)</option>
            <option value="4">嘴 (4)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">模型缩放</label>
          <input
            type="number"
            value={faceScale ?? '1'}
            onChange={(e) => onUpdate('faceScale', parseFloat(e.target.value) || 1)}
            step="0.1"
            min="0.1"
            max="5"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300
              focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/30"
          />
        </div>
      </div>
      <p className="text-[10px] text-slate-600">选择模型附着在面部的哪个特征点位置</p>
    </div>
  );

  // ── Plane tracking config ──
  const renderPlaneConfig = () => (
    <div className="mt-3 space-y-3">
      <label className="block text-xs font-medium text-slate-400">平面检测模式</label>
      <div className="flex gap-2">
        {[
          { id: 'horizontal', label: '水平面', desc: '桌面、地面' },
          { id: 'vertical', label: '垂直面', desc: '墙壁、门' },
          { id: 'any', label: '任意', desc: '所有平面' },
        ].map(mode => {
          const isActive = (planeMode || 'horizontal') === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => onUpdate('planeMode', mode.id)}
              className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                isActive
                  ? 'bg-violet-500/10 border-violet-500/30'
                  : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
            >
              <p className={`text-xs font-medium ${isActive ? 'text-violet-400' : 'text-slate-300'}`}>{mode.label}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">{mode.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── World tracking config ──
  const renderWorldConfig = () => (
    <div className="mt-3 space-y-3">
      <label className="block text-xs font-medium text-slate-400">空间定位配置</label>
      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/10">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Globe size={14} className="text-cyan-400 shrink-0" />
          <span>6DoF 空间追踪 — 模型固定在真实世界位置</span>
        </div>
        <p className="text-[10px] text-slate-600 mt-2">
          无需额外配置。模型将固定在 AR 场景的世界坐标中，用户可从不同角度观看。
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-1">
      {/* 追踪方式选择 */}
      <label className="block text-sm font-medium text-slate-300">追踪方式</label>
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'image', label: '图片追踪', icon: Target },
          { id: 'face', label: '面部追踪', icon: Smile },
          { id: 'plane', label: '平面放置', icon: Box },
          { id: 'world', label: '世界追踪', icon: Globe },
        ].map(t => {
          const Icon = t.icon;
          const isActive = tracking === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onUpdate('tracking', t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border transition-all
                ${isActive
                  ? 'bg-violet-500/10 border-violet-500/30 text-violet-400'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-300'}`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 各类型特有配置 */}
      {tracking === 'image' && renderImageUpload()}
      {tracking === 'face' && renderFaceConfig()}
      {tracking === 'plane' && renderPlaneConfig()}
      {tracking === 'world' && renderWorldConfig()}
    </div>
  );
}
