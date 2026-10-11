/** Textarea: the Input look on a multi-line field (min 72px high, grows vertically on drag). */
import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { FIELD_BASE, cx, type FieldSize } from './cx'

export type TextareaProps = ComponentPropsWithoutRef<'textarea'> & { size?: FieldSize; invalid?: boolean }

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { size = 'md', invalid, className, ...rest },
  ref,
) {
  const pad = size === 'sm' ? 'px-[8px] py-[5px] text-[13px]' : 'px-[10px] py-[7px] text-[14px]'
  return (
    <textarea
      {...rest}
      ref={ref}
      aria-invalid={invalid ? true : rest['aria-invalid']}
      className={cx(FIELD_BASE + ' min-h-[72px] resize-y leading-[1.45] ' + pad, className)}
    />
  )
})
