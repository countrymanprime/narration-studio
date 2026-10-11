/** Checkbox: Base UI behaviour (role, keyboard, indeterminate, form value) with the app's look, in Tailwind utilities. */
import { useId, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import { Icon } from '../Icon'

type DataProps = { [K in `data-${string}`]?: string | number | boolean | undefined }

export type CheckboxProps = DataProps & {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  /** Mixed state (a parent of partly selected children). Shows a dash and reports aria-checked="mixed". */
  indeterminate?: boolean
  disabled?: boolean
  id?: string
  name?: string
  value?: string
  /** Accessible name when there is no visible `label`. */
  'aria-label'?: string
  /** Visible label: wraps the box and the text in a <label>, so a click on the text toggles it. */
  label?: ReactNode
  /** Class for the wrapping <label> (the app's row classes: `row`, `optrow`...). Only used with `label`. */
  labelClassName?: string
  title?: string
}

export const BOX =
  'inline-flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border-2 border-solid border-[var(--btn-line)] ' +
  'bg-[var(--surface)] p-0 text-[11px] leading-none text-[var(--copper-ink)] cursor-pointer outline-none ' +
  'transition-[background-color,border-color] duration-100 ' +
  'hover:border-[var(--copper)] data-[checked]:border-[var(--copper)] data-[checked]:bg-[var(--copper)] ' +
  'data-[indeterminate]:border-[var(--copper)] data-[indeterminate]:bg-[var(--copper)] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] ' +
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[disabled]:hover:border-[var(--btn-line)] ' +
  'data-[disabled]:data-[checked]:hover:border-[var(--copper)]'

export function Checkbox({ onCheckedChange, label, labelClassName, indeterminate, 'aria-label': ariaLabel, ...rest }: CheckboxProps) {
  const labelId = useId()
  const box = (
    <BaseCheckbox.Root
      {...(rest as ComponentPropsWithoutRef<typeof BaseCheckbox.Root>)}
      indeterminate={indeterminate}
      onCheckedChange={onCheckedChange ? (c) => onCheckedChange(c) : undefined}
      aria-label={label ? undefined : ariaLabel}
      aria-labelledby={label ? labelId : undefined}
      className={BOX}
    >
      <BaseCheckbox.Indicator keepMounted={false} className="flex items-center justify-center">
        <Icon name={indeterminate ? 'minus' : 'check'} />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  )
  if (!label) return box
  return (
    <label className={labelClassName ?? 'row'} style={{ flexWrap: 'nowrap', gap: 8, cursor: rest.disabled ? 'not-allowed' : 'pointer' }}>
      {box}<span id={labelId}>{label}</span>
    </label>
  )
}
