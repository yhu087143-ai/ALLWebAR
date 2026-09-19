import React, { useState } from 'react';
import { Link, Upload } from 'lucide-react';
import ModelUploader from '../ModelUploader.jsx';

/**
 * 文件或 URL 输入 — 在文本 URL 输入和文件上传之间切换
 *
 * @param {Object} props
 * @param {string} props.value        当前 URL 值
 * @param {(url: string) => void} props.onChange  值变更回调
 * @param {string} props.placeholder  输入框占位符
 * @param {'model'|'image'|'audio'} props.accept  接受的文件类型
 * @param {string} [props.label]      可选的标签文本
 * @param {boolean} [props.compact]   紧凑模式（小字号）
 */
export default function FileOrUrlInput({ value, onChange, placeholder, accept = 'model', label, compact }) {
  const [source, setSource] = useState(value ? 'url' : 'url'); // always start in URL mode

  return (
    <div>
      {/* 来源切换 */}
      <div className="flex gap-1 mb-1.5">
        <button
          type="button"
          onClick={() => setSource('url')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${
            source === 'url'
              ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
              : 'bg-white/5 text-slate-500 border border-white/5 hover:bg-white/10'
          }`}
        >
          <Link size={10} />
          输入 URL
        </button>
        <button
          type="button"
          onClick={() => setSource('upload')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${
            source === 'upload'
              ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
              : 'bg-white/5 text-slate-500 border border-white/5 hover:bg-white/10'
          }`}
        >
          <Upload size={10} />
          上传文件
        </button>
      </div>

      {source === 'url' ? (
        <div>
          {label && <label className="block text-xs text-slate-500 mb-1">{label}</label>}
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full bg-white/5 border border-white/10 rounded-lg text-slate-300 placeholder:text-slate-600
              focus:outline-none focus:border-violet-500/40 focus:bg-violet-500/[0.03] transition-all
              ${compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'}`}
          />
        </div>
      ) : (
        <div className={compact ? 'scale-90 origin-left' : ''}>
          {accept === 'model' && (
            <ModelUploader onUploadComplete={(url) => { onChange(url); setSource('url'); }} />
          )}
          {(accept === 'image' || accept === 'audio') && (
            <div className="p-3 rounded-lg border border-dashed border-white/10 bg-white/[0.02]">
              <input
                type="file"
                accept={accept === 'image' ? 'image/*' : 'audio/*'}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    // 对于图片/音频，用 blob URL 做本地预览
                    onChange(URL.createObjectURL(file));
                    setSource('url');
                  }
                }}
                className="w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0
                  file:text-xs file:font-medium file:bg-violet-500/10 file:text-violet-400 hover:file:bg-violet-500/20"
              />
              <p className="text-[10px] text-slate-600 mt-1">
                {accept === 'image' ? '支持 PNG / JPG / WebP' : '支持 MP3 / WAV / OGG'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
