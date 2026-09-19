import React, { useState, useEffect } from 'react';
import {
  Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Eye,
  Copy,
  QrCode,
  Trash2,
  Calendar,
  Smartphone,
  Plus,
  Home,
  ChevronRight,
  AlertCircle,
  Check,
  RotateCw,
  Loader2,
  Move3d,
  Image as ImageIcon,
  Smile,
  Boxes,
} from 'lucide-react';
import QrModal from '../components/QrModal.jsx';
import { viewUrl } from '../utils.js';
import { fetchMyArExperiences, deleteArExperience } from '../api/client.js';

/**
 * 控制台 - 我的 AR 体验列表
 * 展示已创建的 AR 体验，支持管理操作
 */
export default function Dashboard() {
  const [experiences, setExperiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 操作状态
  const [deleteLoading, setDeleteLoading] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [qrTarget, setQrTarget] = useState(null); // { id, url }

  // 加载列表
  const loadExperiences = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchMyArExperiences();
      setExperiences(data);
    } catch (err) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExperiences();
  }, []);

  // 复制链接
  const handleCopy = async (id, url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // 降级方案
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // 删除体验
  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这个 AR 体验吗？删除后无法恢复。')) return;
    setDeleteLoading(id);
    try {
      await deleteArExperience(id);
      setExperiences((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      alert('删除失败：' + (err.message || '未知错误'));
    } finally {
      setDeleteLoading(null);
    }
  };

  // 查看二维码
  const handleShowQr = (id, url) => {
    setQrTarget({ id, url });
  };

  // 追踪类型：标签 + 图标（颜色统一，靠图标区分，避免彩色徽标打架）
  const trackingTypeInfo = {
    plane: { label: '平面追踪', badge: 'badge-info', icon: Move3d },
    image: { label: '图片追踪', badge: 'badge-info', icon: ImageIcon },
    face: { label: '面部追踪', badge: 'badge-info', icon: Smile },
  };

  // 格式化日期
  const formatDate = (dateStr) => {
    try {
      const d = new Date(dateStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="page-wrap page-body">
      {/* 面包屑 */}
      <nav aria-label="面包屑" className="crumb">
        <Home size={12} strokeWidth={1.7} aria-hidden="true" />
        <Link to="/">首页</Link>
        <ChevronRight size={11} strokeWidth={2} aria-hidden="true" className="crumb-sep" />
        <span aria-current="page">控制台</span>
      </nav>

      {/* 页头 */}
      <header className="page-head mt-7">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="icon-tile icon-tile-lg mt-0.5">
              <LayoutDashboard size={20} strokeWidth={1.6} aria-hidden="true" className="text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h1 className="page-title">我的 AR 体验</h1>
              <p className="page-sub">
                这里列出你创建过的全部 AR 体验。复制链接可在手机上打开，二维码用于现场扫码进入。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!loading && !error && (
              <span className="tabular text-[0.72rem] text-slate-600">{experiences.length} 条记录</span>
            )}
            <Link to="/xr-studio" className="btn-ghost btn-sm">
              <Boxes size={14} strokeWidth={1.9} aria-hidden="true" />
              XR 工作室
            </Link>
            <Link to="/create-experience" className="btn-primary btn-sm">
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              新建体验
            </Link>
          </div>
        </div>
        <div className="page-rule" />
      </header>

      {/* 加载状态 */}
      {loading && (
        <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-24">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-violet-400/25 border-t-violet-300" />
          <p className="mt-4 text-[0.78rem] text-slate-500">正在读取体验列表…</p>
        </div>
      )}

      {/* 错误状态 */}
      {error && !loading && (
        <section className="panel px-6 py-12 text-center">
          <AlertCircle size={26} strokeWidth={1.6} aria-hidden="true" className="mx-auto text-rose-300" />
          <h2 className="mt-4 text-[0.9rem] font-medium text-slate-200">加载失败</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[0.75rem] leading-relaxed text-slate-500">{error}</p>
          <button type="button" onClick={loadExperiences} className="btn-ghost btn-sm mt-6">
            <RotateCw size={13} strokeWidth={1.9} aria-hidden="true" />
            重新加载
          </button>
        </section>
      )}

      {/* 空状态 */}
      {!loading && !error && experiences.length === 0 && (
        <section className="panel px-6 py-16 text-center">
          <span className="icon-tile mx-auto flex h-14 w-14" aria-hidden="true">
            <Smartphone size={24} strokeWidth={1.5} className="text-slate-500" />
          </span>
          <h2 className="mt-5 text-[0.95rem] font-medium text-slate-200">还没有 AR 体验</h2>
          <p className="mx-auto mt-2 max-w-sm text-[0.78rem] leading-relaxed text-slate-500">
            从统一创作台开始，或者挑一个现成模板改改就能发布。
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link to="/create-experience" className="btn-primary">
              <Plus size={15} strokeWidth={2} aria-hidden="true" />
              开始创建
            </Link>
            <Link to="/" className="btn-ghost">浏览模板</Link>
          </div>
        </section>
      )}

      {/* 体验列表 */}
      {!loading && !error && experiences.length > 0 && (
        <ul className="space-y-3">
          {experiences.map((exp) => {
            const info = trackingTypeInfo[exp.trackingType] || trackingTypeInfo.plane;
            const TypeIcon = info.icon;
            const isCopied = copiedId === exp.id;
            const isDeleting = deleteLoading === exp.id;
            const label = exp.title || '未命名体验';

            return (
              <li key={exp.id} className="panel panel-hover">
                <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center">
                  {/* 主信息 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[0.88rem] font-medium text-slate-200">{label}</h2>
                      <span className={`badge ${info.badge}`}>
                        <TypeIcon size={11} strokeWidth={1.9} aria-hidden="true" />
                        {info.label}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-[0.72rem] text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Eye size={12} strokeWidth={1.7} aria-hidden="true" />
                        <span className="tabular">{exp.viewCount ?? 0}</span>
                        次访问
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Calendar size={12} strokeWidth={1.7} aria-hidden="true" />
                        <span className="tabular">{formatDate(exp.createdAt)}</span>
                      </span>
                    </div>
                  </div>

                  {/* 操作 */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopy(exp.id, viewUrl(exp.id))}
                      aria-label={`复制「${label}」的分享链接`}
                      className="btn-ghost btn-sm"
                    >
                      {isCopied ? (
                        <>
                          <Check size={13} strokeWidth={2.2} aria-hidden="true" className="text-emerald-300" />
                          已复制
                        </>
                      ) : (
                        <>
                          <Copy size={13} strokeWidth={1.9} aria-hidden="true" />
                          复制链接
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleShowQr(exp.id, viewUrl(exp.id))}
                      aria-label={`查看「${label}」的二维码`}
                      className="btn-ghost btn-sm px-2.5"
                    >
                      <QrCode size={15} strokeWidth={1.8} aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(exp.id)}
                      disabled={isDeleting}
                      aria-label={`删除「${label}」`}
                      className="btn-ghost btn-sm px-2.5 hover:border-rose-400/40 hover:bg-rose-500/[0.08] hover:text-rose-300 disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <Loader2 size={15} strokeWidth={2} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 二维码弹窗 */}
      <QrModal
        url={qrTarget ? viewUrl(qrTarget.id) : ''}
        isOpen={!!qrTarget}
        onClose={() => setQrTarget(null)}
      />
    </div>
  );
}
