import type { ReactNode } from 'react';
import { HIT_AREA_32 } from './hitArea';
import { Dot } from './StatusBadge';

/**
 * What a header chip says about its subject: `neutral` for a readout (the running timer, the series, an engine that needs
 * nothing), `success` for a live link (REAPER linked), `warning` for one that needs the narrator (the wrong project open).
 */
export type HeaderChipTone = 'neutral' | 'success' | 'warning';

// The fill and text per tone, the benchmark mocks' own (mock 01's header): the timer on `--surface-2` in `--text`, "REAPER linked" on `--ok-soft` in `--ok-text`. Each pair is one the
// palette guard already checks.
// A neutral chip keeps a `--border` rim: its `--surface-2` fill is about 1.1:1 on the bar, where it read as a grey blob beside the tinted chips
// (alignment audit R3SL-5).
const TONE: Record<HeaderChipTone, { background: string; color: string; borderColor: string }> = {
  neutral: { background: 'var(--surface-2)', color: 'var(--text)', borderColor: 'var(--border)' },
  success: { background: 'var(--ok-soft)', color: 'var(--ok-text)', borderColor: 'transparent' },
  warning: { background: 'var(--warn-soft)', color: 'var(--warn-text)', borderColor: 'transparent' },
};

// Measured on mock 01 at 1440 px: 22 px tall, fully rounded, 10 px each side, its parts 6 px apart, Barlow Condensed 600 at 11.5 px in the label's own
// case; the same 22 px as the status pills beside it in the Booth's bar (booth-alignment.spec.ts). A chip that is a button takes presses in a 32 px
// box around it, the height of the Jump to field beside it (alignment audit XSL-3, XSL-12, R3PR2-20, R3PF-7). A 1 px rim inside the 22 px,
// transparent but on the neutral tone, keeps every tone one size. Below `md` the chip's side padding shrinks with its text (see `short`).
const CHIP =
  "box-border inline-flex h-[1.375rem] items-center border border-solid gap-[0.375rem] rounded-full px-[0.625rem] font-['Barlow_Condensed',sans-serif] text-[0.72rem] font-semibold tracking-[0.03em] whitespace-nowrap";

/**
 * The header's chip: the running timer, the audio engine and the Booth's built-in recorder are one shape. A
 * `dot` draws the status dot in that colour ahead of the content; `onClick` makes the chip a button (the engine chip opens
 * the engine panel). `short` is for a chip whose text hides below `md` (it keeps its dot or clock): its padding tightens
 * with it. The accessible name, when the visible text is not the whole of it, comes from `aria-label`.
 */
export function HeaderChip({
  tone = 'neutral',
  dot,
  children,
  onClick,
  short = false,
  role,
  'aria-label': ariaLabel,
  title,
  'aria-busy': ariaBusy,
  className = '',
}: {
  tone?: HeaderChipTone;
  /** The status dot's colour (a token), drawn before the content. */
  dot?: string;
  children?: ReactNode;
  onClick?: () => void;
  short?: boolean;
  /** `group` for a named chip that is not a button; `timer` for the running clock (never a live region). */
  role?: 'group' | 'timer';
  'aria-label'?: string;
  /** The native hint on a chip that is a button (what pressing it does). */
  title?: string;
  'aria-busy'?: boolean;
  /** Placement only (`flex-none`, or `min-w-0` for a chip that truncates): the look is the chip's. */
  className?: string;
}) {
  const classes = `${CHIP} ${short ? 'max-md:px-[0.375rem]' : ''} ${className}`.replace(/\s+/g, ' ').trim();
  const content = (
    <>
      {dot && <Dot color={dot} />}
      {children}
    </>
  );
  if (onClick)
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={ariaLabel}
        aria-busy={ariaBusy || undefined}
        className={`${classes} ${HIT_AREA_32} cursor-pointer hover:shadow-[inset_0_0_0_1px_var(--accent)] disabled:pointer-events-none disabled:opacity-60`}
        style={TONE[tone]}
      >
        {content}
      </button>
    );
  return (
    <span role={role} aria-label={ariaLabel} aria-busy={ariaBusy || undefined} className={classes} style={TONE[tone]}>
      {content}
    </span>
  );
}
