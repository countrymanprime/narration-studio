import type { ComponentPropsWithRef, ReactNode } from 'react';
import type { IconName } from '../../icons.catalog';
import { Icon } from './Icon';
import { TooltipTarget } from './Tooltip';

// One control made of joined parts: a main action, an optional switch that changes what the main action is about to do, and a side button
// that opens a menu or popover (the Booth's Record, Cold read and Levels). It owns its look like `Button` does, so a page composes the
// parts and passes `className` for layout only. The parts must be direct children of `SplitButton`: the first takes the left radius, the
// last the right, and each overlaps its neighbour's border by 1 px so the seams are one line.

const PART =
  "inline-flex min-h-[var(--button-height)] items-center justify-center gap-1.5 border px-3 py-1 font-['Barlow_Condensed',sans-serif] text-[length:var(--font-size-sm)] leading-none font-semibold tracking-[var(--tracking-button)] uppercase motion-ok:transition focus-visible:relative focus-visible:z-10 not-aria-busy:aria-disabled:cursor-not-allowed";
// Disabled, as `Button` draws it: the surface-2 fill and the muted label, its edge kept.
const DISABLED = 'not-aria-busy:aria-disabled:bg-[var(--surface-2)] not-aria-busy:aria-disabled:text-[var(--text-muted)]';

const TONES = {
  // The action's own fill, as a primary `Button`.
  primary: 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] not-aria-disabled:hover:bg-[var(--accent-strong)]',
  // The recording colour as an outline, never the primary fill beside it (a pressed switch).
  danger: 'border-[var(--danger)] bg-transparent text-[var(--danger-text)] not-aria-disabled:hover:bg-[var(--review-soft)]',
  // A part of a joined control that is not the main action: a secondary `Button`'s look.
  secondary: 'border-[var(--btn-line)] bg-[var(--surface)] text-[var(--text)] not-aria-disabled:hover:bg-[var(--surface-2)]',
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

/** The main action, in the accent fill; at least 5.75 rem wide so Record and Stop are the same width. */
export function SplitMain({ className = '', type = 'button', ...rest }: PartProps) {
  return <button type={type} className={`${PART} ${TONES.primary} ${DISABLED} min-w-[5.75rem] ${className}`} {...rest} />;
}

/**
 * A switch between the main action and the side: pressed (`aria-pressed`) it takes the recording colour as an outline. Below the `lg` breakpoint it draws the icon
 * alone (the label stays as the accessible name, `sr-only`) `hint` is its tooltip: what pressing it does, or why it cannot.
 */
export function SplitToggle({
  pressed,
  icon,
  children,
  hint,
  className = '',
  type = 'button',
  ...rest
}: Omit<PartProps, 'aria-pressed' | 'title'> & { pressed: boolean; icon: IconName; hint: string }) {
  return (
    <TooltipTarget text={hint}>
      <button type={type} aria-pressed={pressed} className={`${PART} ${pressed ? TONES.danger : TONES.secondary} ${DISABLED} ${className}`} {...rest}>
        <span className="contents lg:hidden">
          <Icon name={icon} />
        </span>
        <span className="max-lg:sr-only">{children}</span>
      </button>
    </TooltipTarget>
  );
}

/**
 * The side button: a caret that opens what the group's settings are. It is a Base UI `render` target (a `Popover` trigger), so it forwards
 * every attribute and the ref, and it carries its own hint.
 */
export function SplitSide({
  label,
  badge = false,
  className = '',
  type = 'button',
  ...rest
}: Omit<PartProps, 'aria-label' | 'title'> & { label: string; badge?: boolean }) {
  return (
    <TooltipTarget text={label}>
      <button type={type} aria-label={label} className={`${PART} relative px-2! ${TONES.primary} ${DISABLED} ${className}`} {...rest}>
        <Icon name="openMenu" />
        {badge ? (
          <span aria-hidden className="absolute top-1 right-1 size-2 rounded-full bg-[var(--warn)] ring-2 ring-2 ring-[var(--surface)] ring-[var(--surface)]" />
        ) : null}
      </button>
    </TooltipTarget>
  );
}
