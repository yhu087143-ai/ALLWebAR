import React from 'react';
import { Send, CheckCircle, AlertCircle, Copy, Download, ExternalLink } from 'lucide-react';
import QrModal from '../QrModal.jsx';

/**
 * Step 5：发布
 *
 * 标题 + 发布按钮 + 成功后显示链接和二维码。
 *
 * Props:
 *   title: string
 *   onTitleChange: (v) => void
 *   onPublish: () => void
 *   publishing: boolean
 *   publishError: string
 *   publishResult: { fullUrl, url } | null
 *   showQr: boolean
 *   onShowQr: (v) => void
 */
export default function StepPublish({
  title = '',
  onTitleChange,
  onPublish,
  publishing = false,
  publishError = '',
  publishResult = null,
  showQr = false,
  onShowQr,
  password = '',
  passwordEnabled = false,
  onPasswordChange,
  onPasswordToggle,
}) {
  const publishUrl = publishResult?.fullUrl || publishResult?.url || '';

  const copyLink = () => {
    if (publishUrl) {
      navigator.clipboard?.writeText(publishUrl);
    }
  };

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">发布体验</h2>
        <p className="text-sm text-slate-500">
          为 AR 体验命名并发布，生成分享链接和二维码
        </p>
      </div>

      {!publishResult ? (
        <div className="glass-card rounded-xl">
          <div className="p-6 space-y-5">
            {/* 标题 */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                体验标题 <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="给我的 AR 体验取个名字"
                className="w-full"
              />
              <p className="text-xs text-slate-600 mt-1">用户通过分享链接打开时将看到此标题</p>
            </div>

            {/* 密码保护 */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <div>
                <label className="text-sm font-medium text-slate-300">密码保护</label>
                <p className="text-xs text-slate-500">用户需要输入密码才能访问</p>
              </div>
              <button
                type="button"
                onClick={() => onPasswordToggle(!passwordEnabled)}
                className={`relative w-11 rounded-full transition-colors ${passwordEnabled ? 'bg-violet-500' : 'bg-white/20'}`}
                style={{ height: '22px' }}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${
                  passwordEnabled ? 'translate-x-[22px]' : 'left-0.5'
                }`} />
              </button>
            </div>
            {passwordEnabled && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">访问密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  placeholder="设置 4-6 位数字密码"
                  className="w-full"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
                <p className="text-xs text-slate-600 mt-1">用户打开 AR 体验时需要输入此密码</p>
              </div>
            )}

            {/* 发布按钮 */}
            <button
              onClick={onPublish}
              disabled={publishing || !title.trim()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold
                bg-gradient-to-r from-violet-500 to-violet-600 text-white
                hover:from-violet-400 hover:to-violet-500
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200 shadow-lg shadow-violet-500/25
                active:scale-95"
            >
              {publishing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  发布中...
                </>
              ) : (
                <>
                  <Send size={16} />
                  发布体验
                </>
              )}
            </button>

            {/* 错误提示 */}
            {publishError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                <p className="text-sm text-rose-400">{publishError}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 发布成功 */
        <div className="glass-card rounded-xl border border-emerald-500/20">
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle size={28} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-emerald-400">发布成功！</h3>
                <p className="text-xs text-slate-500">AR 体验已上线</p>
              </div>
            </div>

            {/* 链接 */}
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">分享链接</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={publishUrl}
                  className="flex-1 text-xs text-slate-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2"
                />
                <button
                  onClick={copyLink}
                  className="px-3 py-2 rounded-lg text-xs bg-white/5 border border-white/10 text-slate-400 hover:text-violet-400 hover:border-violet-500/30 transition-all"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => onShowQr(true)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                  bg-violet-500/10 text-violet-400 border border-violet-500/20
                  hover:bg-violet-500/20 transition-all"
              >
                <Download size={14} />
                查看二维码
              </button>
              <a
                href={publishUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                  bg-white/5 text-slate-400 border border-white/10
                  hover:bg-white/10 transition-all"
              >
                <ExternalLink size={14} />
                打开体验
              </a>
            </div>
          </div>
        </div>
      )}

      {/* QR 弹窗 */}
      <QrModal
        url={publishUrl}
        isOpen={showQr}
        onClose={() => onShowQr(false)}
      />
    </div>
  );
}
