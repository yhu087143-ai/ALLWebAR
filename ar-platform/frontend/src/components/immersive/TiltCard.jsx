import React, { useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';

/**
 * TiltCard —— 跟随指针的三维倾斜卡片 + 光斑
 *
 * 卡片容器写入 4 个 CSS 变量，由 CSS 完成渲染：
 *   --rx / --ry  倾斜角（度）
 *   --mx / --my  指针在卡片内的百分比坐标（用于径向光斑）
 *
 * 用写 CSS 变量的方式而不是 React state：每帧不触发重渲染，
 * 指针离开时把变量归零，CSS transition 负责回弹。
 */
export default function TiltCard({
  children,
  className = '',
  href,
  to,
  maxTilt = 8,
  spotlight = true,
  ...rest
}) {
  const ref = useRef(null);

  const onPointerMove = useCallback(
    (e) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      el.style.setProperty('--ry', `${((px - 0.5) * maxTilt * 2).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${((0.5 - py) * maxTilt * 2).toFixed(2)}deg`);
      el.style.setProperty('--mx', `${(px * 100).toFixed(2)}%`);
      el.style.setProperty('--my', `${(py * 100).toFixed(2)}%`);
      el.classList.add('is-tilting');
    },
    [maxTilt]
  );

  const onPointerLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.classList.remove('is-tilting');
  }, []);

  const cls = `tilt-card ${spotlight ? 'tilt-card-spotlight' : ''} ${className}`;
  const props = {
    ref,
    className: cls,
    onPointerMove,
    onPointerLeave,
    ...rest,
  };

  if (to) {
    return (
      <Link to={to} {...props}>
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    );
  }
  return <div {...props}>{children}</div>;
}
