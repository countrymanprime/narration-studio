import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Icon } from './Icon';
import { PendingSpinner } from './PendingSpinner';
import { TooltipTarget } from './Tooltip';

// One control made of joined parts: a main action and a side button that opens a menu or popover (the Booth's Record and its Levels, where the
// side menu also picks whether the main action records or reads cold). It owns its look like `Button` does, so a page composes the
// parts and passes `className` for layout only. The parts must be direct children of `SplitButton`: the first takes the left radius, the
// last the right, and each overlaps its neighbour's border by 1 px so the seams are one line.

const PART =
  "inline-flex min-h-[var(--button-height)] items-center justify-center gap-1.5 border px-3 py-1 font-['Barlow_Condensed',sans-serif] text-[length:var(--font-size-sm)] leading-none font-semibold tracking-[var(--tracking-button)] uppercase motion-ok:transition focus-visible:relative focus-visible:z-10 not-aria-busy:aria-disabled:cursor-not-allowed";
// Disabled, as `Button` draws it: the surface-2 fill and the muted label, its edge kept.
const DISABLED = 'not-aria-busy:aria-disabled:bg-[var(--surface-2)] not-aria-busy:aria-disabled:text-[var(--text-muted)]';

const TONES = {
  // The action's own fill, as a primary `Button`.
  primary: 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] not-aria-disabled:hover:bg-[var(--accent-strong)]',
  // A cold read: the info colour as an outline on its soft fill, so it can be neither mistaken for Record's fill nor for a take's red.
  cold: 'border-[var(--info)] bg-[var(--info-soft)] text-[var(--info-text)] not-aria-disabled:hover:brightness-95',
} as const;

/** The group: one tab-reachable control of several buttons. `label` names it for a screen reader. */
export function SplitButton({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    // The seams and the outer radii are set from here, not by each part: a part wrapped in its hint (a `span`) is still the first or last child.
    <div
      role="group"
      aria-label={label}
      className={`inline-flex flex-none [&>:first-child,&>:first-child>button]:rounded-l-[var(--radius-button)] [&>:last-child,&>:last-child>button]:rounded-r-[var(--radius-button)] [&>:not(:first-child)]:-ml-px ${className}`}
    >
      {children}
    </div>
  );
}

type PartProps = ComponentPropsWithRef<'button'>;

/**
 * The main action; at least 5.75 rem wide so Record and Stop are the same width. `tone` `primary` is the accent fill, `cold` the outlined
 * info colour of a cold read, never a take's fill or red. `hint` is its tooltip, for a state the label alone does not explain. `pending`: the
 * action it started is running (see `Button`).
 */
export function SplitMain({
  tone = 'primary',
  hint,
  className = '',
  type = 'button',
  pending = false,
  onClick,
  children,
  ...rest
}: PartProps & { tone?: 'primary' | 'cold'; hint?: string; pending?: boolean }) {
  // `pending` is `Button`'s pending state, drawn for a filled part: busy (`aria-busy`, a spinner before the label), a click ignored, still focusable.
  // The label stays at full strength (a dimmed label over the accent fill measured 2.56:1 in light, and a take's wait can last seconds), so the
  // spinner and a progress cursor say the wait; `hint` says what it waits for.
  const button = (
    <button
      type={type}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      onClick={pending ? (event) => event.preventDefault() : onClick}
      className={`${PART} ${TONES[tone]} ${DISABLED} min-w-[5.75rem] aria-busy:cursor-progress aria-busy:aria-disabled:opacity-100 ${className}`}
      {...rest}
    >
      {pending && <PendingSpinner />}
      {children}
    </button>
  );
  return hint ? <TooltipTarget text={hint}>{button}</TooltipTarget> : button;
}

/**
 * The side button: a caret that opens what the group's settings are. It is a Base UI `render` target (a `Popover` trigger), so it forwards
 * every attribute and the ref, and it carries its own hint.
 */
export function SplitSide({
  label,
  tone = 'primary',
  badge = false,
  className = '',
  type = 'button',
  ...rest
}: Omit<PartProps, 'aria-label' | 'title'> & { label: string; tone?: 'primary' | 'cold'; badge?: boolean }) {
  return (
    <TooltipTarget text={label}>
      <button type={type} aria-label={label} className={`${PART} relative px-2! ${TONES[tone]} ${DISABLED} ${className}`} {...rest}>
        <Icon name="openMenu" />
        {badge ? <span aria-hidden className="absolute top-1 right-1 size-2 rounded-full bg-[var(--warn)] ring-2 ring-[var(--surface)]" /> : null}
      </button>
    </TooltipTarget>
  );
}
