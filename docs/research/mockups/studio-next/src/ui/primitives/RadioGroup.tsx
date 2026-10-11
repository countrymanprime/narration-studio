/**
 * RadioGroup + Radio: Base UI behaviour (role=radiogroup/radio, roving tabindex, arrow keys, form value) with the app's look.
 * <RadioGroup aria-label="..." value onValueChange><Radio value label description extra /></RadioGroup>
 * A Radio used outside a RadioGroup becomes a one-item group (give it `name`, `checked`, `onCheckedChange`); use it only for
 * mock panels, since arrow keys move between radios only when they share a RadioGroup.
 */
import { createContext, useContext, useId, type ReactNode } from 'react'
import { RadioGroup as BaseGroup } from '@base-ui/react/radio-group'
import { Radio as BaseRadio } from '@base-ui/react/radio'
import { BOX } from './Checkbox'

const InGroup = createContext(false)

type GroupProps<T extends string> = {
  value?: T
  defaultValue?: T
  onValueChange?: (value: T) => void
  name?: string
  disabled?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
  className?: string
  children: ReactNode
}

export function RadioGroup<T extends string = string>({ onValueChange, className, children, ...rest }: GroupProps<T>) {
  return (
    <BaseGroup {...rest} className={className ?? 'stack'} onValueChange={onValueChange ? (v) => onValueChange(v as T) : undefined}>
      <InGroup.Provider value>{children}</InGroup.Provider>
    </BaseGroup>
  )
}

const RADIO = BOX.replace('rounded-[4px]', 'rounded-full')

export type RadioProps = {
  value: string
  /** Visible label text (also the accessible name). */
  label: ReactNode
  /** Second line under the label, for settings-style rows. */
  description?: ReactNode
  /** Controls placed after the label on the same row (pills, buttons). */
  extra?: ReactNode
  disabled?: boolean
  id?: string
  className?: string
  /** Standalone use only (outside a RadioGroup). */
  name?: string
  checked?: boolean
  onCheckedChange?: () => void
} & { [K in `data-${string}`]?: string | number | boolean | undefined }

export function Radio({ value, label, description, extra, disabled, id, className, name, checked, onCheckedChange, ...data }: RadioProps) {
  const grouped = useContext(InGroup)
  const labelId = useId()
  const descId = useId()
  const item = (
    <label className={className ?? 'row'} style={{ flexWrap: 'nowrap', cursor: disabled ? 'not-allowed' : 'pointer', alignItems: description ? 'flex-start' : undefined }}>
      <BaseRadio.Root value={value} disabled={disabled} id={id} {...data} aria-labelledby={labelId} aria-describedby={description ? descId : undefined} className={RADIO + (description ? ' mt-px' : '')}>
        <BaseRadio.Indicator keepMounted={false} className="block size-2 rounded-full bg-[var(--copper-ink)]" />
      </BaseRadio.Root>
      <span id={labelId}>
        {label}
        {description ? <span id={descId} className="block text-[12px] text-[var(--muted)]">{description}</span> : null}
      </span>
      {extra}
    </label>
  )
  if (grouped) return item
  return (
    <BaseGroup
      name={name}
      value={checked ? value : ''}
      onValueChange={() => onCheckedChange?.()}
      aria-label={typeof label === 'string' ? label : undefined}
      className="contents"
      render={<span />}
    >
      <InGroup.Provider value>{item}</InGroup.Provider>
    </BaseGroup>
  )
}
