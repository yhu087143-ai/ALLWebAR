import React, { useState, useRef } from 'react';
import { Upload, File, CheckCircle, X } from 'lucide-react';
import { uploadModel } from '../api/client.js';

/**
 * 模型上传组件
 * 支持拖拽或点击上传，对接后端 /api/models/upload
 *
 * @param {{ onUploadComplete: (url: string) => void }} props
 */
export default function ModelUploader({ onUploadComplete }) {
  const [uploadState, setUploadState] = useState('idle'); // idle | uploading | done | error
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  // 真实上传
  const doUpload = async (file) => {
    setFileName(file.name);
    setUploadState('uploading');
    setProgress(0);
    setErrorMsg('');

    // 验证文件类型
    const ext = file.name.split('.').pop().toLowerCase();
    const validExts = ['glb', 'gltf'];
    if (!validExts.includes(ext)) {
      setUploadState('error');
      setErrorMsg(`不支持的文件格式 (.${ext})，支持格式：${validExts.join(', ')}`);
      return;
    }

    try {
      const result = await uploadModel(file, (pct) => {
        setProgress(Math.round(pct * 100));
      });

      setUploadState('done');
      setProgress(100);
      if (onUploadComplete) {
        onUploadComplete(result.url);
      }
    } catch (err) {
      setUploadState('error');
      setErrorMsg(err.message || '上传失败');
    }
  };

  // 处理文件选择
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) doUpload(file);
  };

  // 处理拖拽
  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) doUpload(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // 重置上传
  const handleReset = () => {
    setUploadState('idle');
    setProgress(0);
    setFileName('');
    setErrorMsg('');
    if (inputRef.current) inputRef.current.value = '';
  };

  // 渲染状态
  const renderContent = () => {
    // 已完成
    if (uploadState === 'done') {
      return (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle size={24} className="text-emerald-400" />
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-300 font-medium">上传完成</p>
            <p className="text-xs text-slate-500 mt-1 truncate max-w-[250px]">{fileName}</p>
          </div>
          <button
            onClick={handleReset}
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            重新上传
          </button>
        </div>
      );
    }

    // 上传中
    if (uploadState === 'uploading') {
      return (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-12 h-12 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <File size={24} className="text-violet-400" />
          </div>
          <div className="text-center w-full max-w-[250px]">
            <p className="text-sm text-slate-300 font-medium mb-1">正在上传...</p>
            <p className="text-xs text-slate-500 mb-3 truncate">{fileName}</p>
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-violet-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">{progress}%</p>
          </div>
        </div>
      );
    }

    // 错误
    if (uploadState === 'error') {
      return (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <X size={24} className="text-rose-400" />
          </div>
          <div className="text-center">
            <p className="text-sm text-rose-400 font-medium">上传失败</p>
            <p className="text-xs text-slate-500 mt-1">{errorMsg}</p>
          </div>
          <button
            onClick={handleReset}
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            重试
          </button>
        </div>
      );
    }

    // 空闲状态 - 显示上传区域
    return (
      <div
        ref={dropRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="flex flex-col items-center gap-3 py-6 cursor-pointer hover:bg-white/[0.02] rounded-lg transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        <div className="w-14 h-14 rounded-2xl bg-violet-500/5 border border-dashed border-violet-500/20 flex items-center justify-center">
          <Upload size={24} className="text-violet-400/60" />
        </div>
        <div className="text-center">
          <p className="text-sm text-slate-400 font-medium">
            点击或拖拽上传 3D 模型
          </p>
          <p className="text-xs text-slate-600 mt-1">
            支持 GLB / GLTF
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="glass-card rounded-xl">
      <input
        ref={inputRef}
        type="file"
        accept=".glb,.gltf"
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="p-5">
        <label className="block text-sm font-medium text-slate-300 mb-3">
          上传 3D 模型
        </label>
        {renderContent()}
      </div>
    </div>
  );
}
