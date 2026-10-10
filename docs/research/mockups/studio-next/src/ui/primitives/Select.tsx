/**
 * Select: Base UI Select (button trigger, listbox popup, typeahead, arrow keys, Escape) with the app's field look.
 * <Select value onValueChange options={[{ value, label, style? }]} aria-label disabled className placeholder />
 * `id`, `aria-*` and `data-*` land on the trigger button. The popup is portalled to <body>, sits above popovers (.pop 75) and
 * dialogs (.scrim 50), and carries data-keeppop so a click in it does not close an enclosing app popover.
 */
import { forwardRef, type CSSProperties, type ReactNode } from 'react'
import { Select as BaseSelect } from '@base-ui/react/select'
import { Icon } from '../Icon'
import { FIELD_BASE, HEIGHT, cx, type FieldSize } from './cx'

export type SelectOption = { value: string; label: ReactNode; style?: CSSProperties; disabled?: boolean }

type DataProps = { [K in `data-${string}`]?: string | number | boolean | undefined }

export type SelectProps = DataProps & {
  value: string
  onValueChange: (value: string) => void
  options: readonly SelectOption[]
  id?: string
  name?: string
  disabled?: boolean
  invalid?: boolean
  size?: FieldSize
  placeholder?: string
  className?: string
  /** Style for the trigger (a width, or the selected font). */
  style?: CSSProperties
  title?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
}

const ITEM =
  'flex min-h-8 cursor-pointer select-none items-center gap-2 rounded-[6px] px-2 py-1 text-[14px] text-[var(--ink)] outline-none ' +
  'data-[highlighted]:bg-[var(--raised)] data-[selected]:font-semibold data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50'

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  { value, onValueChange, options, disabled, invalid, size = 'md', placeholder, className, style, name, 'aria-label': ariaLabel, ...rest },
  ref,
) {
  const { id, title, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, ...data } = rest
  const current = options.find((o) => o.value === value)
  return (
    <BaseSelect.Root
      value={current ? value : null}
      onValueChange={(v) => { if (typeof v === 'string') onValueChange(v) }}
      items={options as unknown as { value: string; label: ReactNode }[]}
      disabled={disabled}
      name={name}
      modal={false}
    >
      <BaseSelect.Trigger
        {...data}
        ref={ref}
        id={id}
        title={title}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid ? true : undefined}
        style={style}
        className={cx(
          FIELD_BASE + ' ' + HEIGHT[size] + ' flex items-center justify-between gap-2 text-left cursor-pointer ' +
            'data-[popup-open]:border-[var(--copper)] data-[disabled]:cursor-not-allowed',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate" style={current?.style}>
          {current ? current.label : <span className="text-[var(--faint)]">{placeholder ?? ''}</span>}
        </span>
        <BaseSelect.Icon className="flex shrink-0 text-[11px] text-[var(--muted)]"><Icon name="caret" /></BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} alignItemWithTrigger={false} className="z-[110] outline-none" data-keeppop>
          <BaseSelect.Popup
            data-keeppop
            className="box-border max-h-[min(320px,var(--available-height))] min-w-[var(--anchor-width)] max-w-[min(420px,calc(100vw-16px))] overflow-y-auto rounded-[8px] border border-solid border-[var(--line-strong)] bg-[var(--surface)] p-1 shadow-[var(--shadow)] outline-none"
          >
            <BaseSelect.List className="outline-none">
              {options.map((o) => (
                <BaseSelect.Item key={o.value} value={o.value} disabled={o.disabled} className={ITEM} style={o.style}>
                  <span className="flex size-4 shrink-0 items-center justify-center text-[11px] text-[var(--copper-text)]">
                    <BaseSelect.ItemIndicator keepMounted={false}><Icon name="check" /></BaseSelect.ItemIndicator>
                  </span>
                  <BaseSelect.ItemText className="min-w-0 flex-1">{o.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
})
