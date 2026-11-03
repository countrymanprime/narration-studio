/** Input: Base UI Input (native <input>, Field-aware) with the app's field look. Any type: text, search, date, number, time... */
import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { Input as BaseInput } from '@base-ui/react/input'
import { FIELD_BASE, HEIGHT, cx, type FieldSize } from './cx'

export type InputProps = Omit<ComponentPropsWithoutRef<'input'>, 'size'> & {
  /** `md` is 36px high, `sm` is 32px. */
  size?: FieldSize
  /** Marks the field invalid: aria-invalid and a red border. */
  invalid?: boolean
  /** `bare` drops the box (border, fill, height) for a field that sits inside another surface: the palette box, a title. */
  variant?: 'field' | 'bare'
}

const BARE =
  'block w-full min-w-0 box-border border-0 bg-transparent p-0 text-[var(--ink)] placeholder:text-[var(--faint)] outline-none rounded-[4px] ' +
  'focus-visible:outline-2 focus-visible:-outline-offset-2! focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-50'

export const NUMBER_RESET =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', invalid, variant = 'field', className, type = 'text', ...rest },
  ref,
) {
  const cls = cx(variant === 'bare' ? BARE : FIELD_BASE + ' ' + HEIGHT[size] + (type === 'number' ? ' ' + NUMBER_RESET : ''), className)
  return (
    <BaseInput
      {...rest}
      ref={ref}
      type={type}
      aria-invalid={invalid ? true : rest['aria-invalid']}
      className={cls}
    />
  )
})
