import React, { useState, useEffect } from 'react';
import { X, Copy, Check, ExternalLink, QrCode, ShieldAlert } from 'lucide-react';
import { toSecureUrl } from '../utils.js';

/**
 * 二维码展示弹窗
 *
 * @param {{ url: string, isOpen: boolean, onClose: () => void }} props
 */
export default function QrModal({ url, isOpen, onClose }) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  // 生成二维码
  useEffect(() => {
    if (!isOpen || !url) return;

    let cancelled = false;

    // 动态导入 qrcode（浏览器环境）
    // 手机摄像头只在安全上下文可用：二维码里必须是 https，否则扫码进去就是
    // 「摄像头无法访问：当前页面不是安全上下文」。
    const targetUrl = toSecureUrl(url);

    import('qrcode').then((QRCode) => {
      if (cancelled) return;
      QRCode.toDataURL(targetUrl, {
        width: 280,
        margin: 2,
        color: {
          dark: '#ffffff',
          light: '#00000000',
        },
      }).then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      }).catch(() => {
        // 降级：使用外部 API
        if (!cancelled) {
          setQrDataUrl(
            `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(targetUrl)}`
          );
        }
      });
    }).catch(() => {
      // 降级：使用外部 API
      if (!cancelled) {
        setQrDataUrl(
          `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`
        );
      }
    });

    return () => { cancelled = true; };
  }, [url, isOpen]);

  // 复制链接
  const handleCopy = async () => {
    const targetUrl = toSecureUrl(url);
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级方案
      const textarea = document.createElement('textarea');
      textarea.value = toSecureUrl(url);
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗内容 */}
      <div className="relative w-full max-w-sm animate-scale-in">
        <div className="glass-card rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-violet-500/10">
          {/* 头部 */}
          <div className="flex items-center justify-between p-4 border-b border-white/5">
            <div className="flex items-center gap-2">
              <QrCode size={18} className="text-violet-400" />
              <h3 className="text-sm font-semibold text-slate-200">AR 体验已发布</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* 二维码 */}
          <div className="flex flex-col items-center py-6 px-6">
            <div className="w-48 h-48 rounded-xl bg-white/5 flex items-center justify-center mb-4">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR Code"
                  className="w-44 h-44 rounded-lg"
                />
              ) : (
                <div className="w-10 h-10 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
              )}
            </div>

            {/* 链接 */}
            <div className="w-full flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
              <span className="flex-1 text-xs text-slate-400 truncate" title={toSecureUrl(url)}>
                {toSecureUrl(url)}
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                  bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors whitespace-nowrap"
              >
                {copied ? (
                  <>
                    <Check size={12} />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    复制链接
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 底部提示 */}
          <div className="px-6 pb-4">
            {toSecureUrl(url) !== url && url.startsWith('http://') && (
              <p className="text-xs text-amber-400/80 text-center mb-2 flex items-center justify-center gap-1.5">
                <ShieldAlert size={12} />
                已自动使用 HTTPS 链接（手机摄像头只在 HTTPS 下可用）
              </p>
            )}
            <p className="text-xs text-slate-500 text-center">
              扫描二维码或复制链接，在手机上打开即可体验 AR
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
