import { useEffect, useId, useState, type ReactNode } from 'react'

const trim = (n: number | null | undefined, precision: number): string => {
  if (n == null || Number.isNaN(n)) return '0'
  const fixed = n.toFixed(precision)
  return fixed.replace(/\.?0+$/, '') || '0'
}

const inferPrecision = (step: number): number => {
  if (step >= 1) return 0
  const text = String(step)
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}

// ---------------------------------------------------------------- 分区

export function Section({
  title,
  children,
  defaultOpen = true,
  right,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  right?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="section">
      <div
        className={`section-title${open ? '' : ' closed'}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="caret">▼</span>
        <span>{title}</span>
        <span className="spacer" />
        {right}
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------- 数字

/**
 * 数字输入框内部组件：聚焦期间显示用户敲入的草稿，不回弹格式化值。
 * 之前每敲一个字符就 trim 成固定小数位，导致输入「0.05」时敲到「0.0」
 * 就被格式化成「0」，小数点被吞——小数值（0.0x）根本打不进去。
 */
function NumInput({
  value,
  digits,
  min,
  max,
  style,
  onChange,
}: {
  value: number
  digits: number
  min?: number
  max?: number
  style?: React.CSSProperties
  onChange: (v: number) => void
}) {
  const [draft, setDraft] = useState(() => trim(value, digits))
  const [focused, setFocused] = useState(false)

  // 非聚焦时（外部 gizmo 拖拽等改了值）同步回输入框
  useEffect(() => {
    if (!focused) setDraft(trim(value, digits))
  }, [value, focused, digits])

  return (
    <input
      className="num-input"
      style={style}
      value={draft}
      inputMode="decimal"
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        setDraft(trim(value, digits))
      }}
      onChange={(e) => {
        setDraft(e.target.value)
        const parsed = Number.parseFloat(e.target.value)
        if (Number.isNaN(parsed)) return
        let next = parsed
        if (min !== undefined) next = Math.max(min, next)
        if (max !== undefined) next = Math.min(max, next)
        onChange(next)
      }}
    />
  )
}

export function NumberField({
  label,
  value,
  onChange,
  step = 0.01,
  min,
  max,
  slider = true,
  precision,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  slider?: boolean
  precision?: number
}) {
  const digits = precision ?? inferPrecision(step)

  return (
    <div className="field">
      <label title={label}>{label}</label>
      {slider && min !== undefined && max !== undefined ? (
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value ?? 0}
          onChange={(e) => onChange(Number.parseFloat(e.target.value))}
        />
      ) : (
        <span className="spacer" style={{ flex: 1 }} />
      )}
      <NumInput
        value={value ?? 0}
        digits={digits}
        min={min}
        max={max}
        style={{ flex: 'none', width: slider ? 54 : '100%' }}
        onChange={onChange}
      />
    </div>
  )
}

export function Vec3Field({
  label,
  value,
  onChange,
  step = 0.01,
  min,
  max,
}: {
  label: string
  value: [number, number, number]
  onChange: (v: [number, number, number]) => void
  step?: number
  min?: number
  max?: number
}) {
  const digits = inferPrecision(step)
  const axes: ('X' | 'Y' | 'Z')[] = ['X', 'Y', 'Z']
  const safeValue: [number, number, number] = Array.isArray(value) ? value : [0, 0, 0]

  return (
    <div className="field">
      <label title={label}>{label}</label>
      <div className="vec3">
        {safeValue.map((v, i) => (
          <div className="vec3-item" key={axes[i]}>
            <span>{axes[i]}</span>
            <NumInput
              value={v}
              digits={digits}
              min={min}
              max={max}
              onChange={(next) => {
                const copy: [number, number, number] = [...safeValue]
                copy[i] = next
                onChange(copy)
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 其他

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="field">
      <label title={label}>{label}</label>
      <input type="color" value={value ?? '#000000'} onChange={(e) => onChange(e.target.value)} />
      <input
        className="num-input"
        style={{ flex: 1 }}
        value={value ?? ''}
        onChange={(e) => {
          const next = e.target.value.trim()
          // 只提交合法 hex；非法中间态不写引擎（输入框保持受控，显示最近一次的合法值）
          if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange(next)
        }}
      />
    </div>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id} title={label}>
        {label}
      </label>
      <select
        id={id}
        className="select"
        value={value ?? ('' as T)}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id} title={label}>
        {label}
      </label>
      <span className="spacer" style={{ flex: 1 }} />
      <span className="switch">
        <input id={id} type="checkbox" checked={value ?? false} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch-slider" />
      </span>
    </div>
  )
}

export function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="field">
      <label title={label}>{label}</label>
      <input
        className="num-input"
        style={{ flex: 1 }}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
