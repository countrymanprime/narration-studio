import { Input, type InputProps } from './primitives/Input'

/** A text, number or date field that keeps what you type and commits on Enter or when you leave it (like a native change event). */
export function CommitInput({ value, onCommit, type = 'text', onBlur, onKeyDown, ...rest }: Omit<InputProps, 'value' | 'defaultValue' | 'onChange'> & {
  value: string | number; onCommit: (v: string) => void; 'aria-label': string
}) {
  return (
    <Input
      {...rest} type={type} key={String(value)} defaultValue={value}
      onBlur={(e) => { if (e.target.value !== String(value)) onCommit(e.target.value); onBlur?.(e) }}
      onKeyDown={(e) => { onKeyDown?.(e); if (!e.defaultPrevented && e.key === 'Enter') e.currentTarget.blur() }}
    />
  )
}
