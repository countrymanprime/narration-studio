/** FieldRow: a visible label above (or beside, with `inline`) one control, joined by htmlFor so a click on the label focuses it. */
import type { ReactNode } from 'react'

export function FieldRow({ label, htmlFor, inline, hint, children, className }: {
  label: ReactNode; htmlFor?: string; inline?: boolean; hint?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <div className={(inline ? 'flex items-center gap-2 ' : 'flex flex-col gap-1 ') + (className ?? '')}>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <span className="sub">{hint}</span> : null}
    </div>
  )
}
