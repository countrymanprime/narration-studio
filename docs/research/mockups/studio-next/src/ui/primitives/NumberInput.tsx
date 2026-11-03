/**
 * NumberInput: a number field that keeps what you type. A valid in-range value is applied at once; anything else
 * (empty, out of range, not a number) is settled when focus leaves or on Enter: out of range clamps to min/max, junk reverts.
 */
import { forwardRef, useState } from 'react'
import { Input, type InputProps } from './Input'

export type NumberInputProps = Omit<InputProps, 'value' | 'defaultValue' | 'type' | 'onChange' | 'min' | 'max' | 'step'> & {
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onValueChange, min, max, step, onBlur, onKeyDown, ...rest },
  ref,
) {
  const [draft, setDraft] = useState<string | null>(null)
  const inRange = (n: number): boolean => Number.isFinite(n) && (min == null || n >= min) && (max == null || n <= max)
  const settle = (): void => {
    if (draft == null) return
    const n = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(n)) {
      const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
      if (c !== value) onValueChange(c)
    }
    setDraft(null)
  }
  return (
    <Input
      {...rest}
      ref={ref}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft ?? String(value)}
      onChange={(e) => {
        setDraft(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value.trim() !== '' && inRange(n) && n !== value) onValueChange(n)
      }}
      onBlur={(e) => { settle(); onBlur?.(e) }}
      onKeyDown={(e) => { onKeyDown?.(e); if (!e.defaultPrevented && e.key === 'Enter') { settle(); e.currentTarget.select() } }}
    />
  )
})
