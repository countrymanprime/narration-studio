/**
 * Slider: Base UI Slider (role=slider on a native range input, arrow/Home/End/PageUp/PageDown keys, drag) with a copper track.
 * <Slider aria-label value onValueChange min max step />. `id` and `data-*` land on the range input (the element with role=slider). Optional `label` and
 * `valueText` draw the header row (label left, readout right); without them the page supplies its own header.
 */
import { useId, type ReactNode } from 'react'
import { Slider as BaseSlider } from '@base-ui/react/slider'

type DataProps = { [K in `data-${string}`]?: string | number | boolean | undefined }

export type SliderProps = DataProps & {
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  id?: string
  className?: string
  'aria-label'?: string
  /** Visible label above the track; also the accessible name. */
  label?: ReactNode
  /** Readout on the right of the header row (for example "28 px"). Also used as aria-valuetext when it is a string. */
  valueText?: ReactNode
}

export function Slider({
  value, onValueChange, min = 0, max = 100, step = 1, disabled, id, className, 'aria-label': ariaLabel, label, valueText, ...data
}: SliderProps) {
  const labelId = useId()
  const text = typeof valueText === 'string' ? valueText : undefined
  return (
    <div className={'flex w-full min-w-0 flex-col gap-1 ' + (className ?? '')}>
      {label || valueText ? (
        <div className="flex items-baseline justify-between gap-2">
          {label ? <span id={labelId} className="label">{label}</span> : <span />}
          {valueText ? <b className="mono text-[13px]">{valueText}</b> : null}
        </div>
      ) : null}
      <BaseSlider.Root
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        thumbAlignment="center"
        onValueChange={(v) => onValueChange(Array.isArray(v) ? v[0] : v)}
        className="w-full"
      >
        <BaseSlider.Control className="box-border flex h-[22px] w-full touch-none px-[9px] select-none items-center data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50">
          <BaseSlider.Track className="relative h-1 w-full rounded-full bg-[var(--line-strong)]">
            <BaseSlider.Indicator className="rounded-full bg-[var(--copper)]" />
            <BaseSlider.Thumb
              index={0}
              inputRef={(el) => {
                // Base UI puts its own id on the input; the app (labels, tests, e2e) addresses the range by the id it passes.
                if (!el) return
                if (id) el.id = id
                for (const [k, v] of Object.entries(data)) if (v != null) el.setAttribute(k, String(v))
              }}
              getAriaLabel={ariaLabel || label ? () => ariaLabel ?? (typeof label === 'string' ? label : '') : undefined}
              aria-valuetext={text}
              className="size-[18px] rounded-full border-2 border-solid border-[var(--surface)] bg-[var(--copper)] shadow-[0_0_0_1px_var(--copper),0_1px_3px_rgba(0,0,0,.3)] outline-none cursor-grab active:cursor-grabbing has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] data-[disabled]:cursor-not-allowed"
            />
          </BaseSlider.Track>
        </BaseSlider.Control>
      </BaseSlider.Root>
    </div>
  )
}
