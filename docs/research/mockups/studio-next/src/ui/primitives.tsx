import { type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/** A secondary action: an icon with a tooltip carrying its name. */
export function IconButton({ icon, tip, className = '', tipSide, flip, ...rest }: {
  icon: IconName; tip: string; tipSide?: 'r' | 'l'; flip?: boolean
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  return (
    <button type="button" {...rest} className={`btn ibtn ${className} ${tipSide ? 'tip-' + tipSide : ''}`.trim()} data-tip={tip} aria-label={tip}>
      <Icon name={icon} flip={flip} />
    </button>
  )
}

/** A text button: for primary calls to action and the audit's text conversions (Cancel, Save, Back...). Icon-only actions use IconButton. */
export function Btn({ className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...rest} className={('btn ' + className).trim()}>{children}</button>
}

export type PillKind = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'copper' | 'violet'
export function Pill({ kind = 'neutral', children, dot, style, title, size }: { kind?: PillKind; children: ReactNode; dot?: boolean; style?: CSSProperties; title?: string; size?: 'sm' }) {
  return (
    <span className={'pill ' + kind + (size ? ' ' + size : '')} style={style} title={title}>
      {dot ? <span className="dot" /> : null}
      {children}
    </span>
  )
}

export const Kbd = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>

export function Seg<T extends string>({ value, options, onChange, label }: {
  value: T; options: Array<[T, ReactNode]>; onChange: (v: T) => void; label: string
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  )
}

export const Swatch = ({ colour, size }: { colour: string; size?: number }) => (
  <span className="swatch" style={{ ['--mc' as string]: 'var(--' + colour + ')', ...(size ? { width: size, height: size } : {}) } as CSSProperties} />
)

export function Empty({ title, children }: { title?: string; children?: ReactNode }) {
  return <div className="empty">{title ? <h3>{title}</h3> : null}{children}</div>
}

/** Label + control, stacked. */
export function Field({ label, htmlFor, children }: { label: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <label className="stack" style={{ gap: 4 }} htmlFor={htmlFor}>
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

/** The Base UI form primitives (Input, Select, Slider...) are re-exported here so one import path serves every control. */
export * from './primitives/index'
