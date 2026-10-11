import { Slider as BaseSlider } from '@base-ui/react/slider';
import { useId, type ReactNode } from 'react';

type DataProps = { [K in `data-${string}`]?: string | number | boolean | undefined };

export type SliderProps = DataProps & {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Lands on the range input, the element with role `slider`. */
  id?: string;
  className?: string;
  'aria-label'?: string;
  /** Visible label on the left of the header row; also the accessible name when no `aria-label` is given. */
  label?: ReactNode;
  /** Readout on the right of the header row, for example "28 px". Used as `aria-valuetext` when it is a string. */
  valueText?: ReactNode;
};

// A single-thumb slider: a 4 px track, an 18 px thumb, and an optional header row (label left, readout right). Base UI
// supplies the native range input, the keys (arrows, Home, End, Page Up, Page Down) and dragging (ADR 0047); the track,
// thumb and focus ring are drawn with the app's tokens. Controlled: it never holds its own value. `id` and `data-*` land on
// the range input so a page can address it. Without `label` and `valueText` no header renders and the page supplies its own.
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  id,
  className,
  'aria-label': ariaLabel,
  label,
  valueText,
  ...data
}: SliderProps) {
  const labelId = useId();
  const ariaValueText = typeof valueText === 'string' ? valueText : undefined;
  const name = ariaLabel ?? (typeof label === 'string' ? label : undefined);
  return (
    <div className={`flex w-full min-w-0 flex-col gap-1${className ? ` ${className}` : ''}`}>
      {label || valueText ? (
        <div className="flex items-baseline justify-between gap-2">
          {label ? (
            <span id={labelId} className="text-sm text-[var(--text-muted)]">
              {label}
            </span>
          ) : (
            <span />
          )}
          {valueText ? <b className="font-mono text-[13px]">{valueText}</b> : null}
        </div>
      ) : null}
      <BaseSlider.Root
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        thumbAlignment="center"
        onValueChange={(next) => onValueChange(Array.isArray(next) ? next[0] : next)}
        className="w-full"
      >
        <BaseSlider.Control className="box-border flex h-[22px] w-full touch-none items-center px-[9px] select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50">
          <BaseSlider.Track className="relative h-1 w-full rounded-full bg-[var(--line-strong)]">
            <BaseSlider.Indicator className="rounded-full bg-[var(--accent)]" />
            <BaseSlider.Thumb
              index={0}
              inputRef={(el) => {
                // Base UI puts its own id on the input; a page addresses the range by the id it passed.
                if (!el) return;
                if (id) el.id = id;
                for (const [key, v] of Object.entries(data)) if (v != null) el.setAttribute(key, String(v));
              }}
              getAriaLabel={name ? () => name : undefined}
              aria-labelledby={name ? undefined : label ? labelId : undefined}
              aria-valuetext={ariaValueText}
              className="size-[18px] cursor-grab rounded-full border-2 border-solid border-[var(--surface)] bg-[var(--accent)] shadow-[0_0_0_1px_var(--accent),0_1px_3px_rgba(0,0,0,.3)] outline-none active:cursor-grabbing has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] data-[disabled]:cursor-not-allowed"
            />
          </BaseSlider.Track>
        </BaseSlider.Control>
      </BaseSlider.Root>
    </div>
  );
}
