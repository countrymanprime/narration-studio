import type { AriaRole, ReactNode } from 'react';

// A card inside a card: a 1 px frame at a 6 px radius with 12 px inside it, on `--surface` (the panel it sits
// in, and an opaque card where it sits on the page). `tone` colours the frame for a problem or a match, `fill` sets it on
// `--surface-2` to lift it off its panel, and `dashed` marks a placeholder (something that is not there yet). It replaces the hand-drawn `rounded-md border px-3 py-2` copies.
type InsetCardTone = 'neutral' | 'accent' | 'warn' | 'danger';

const TONE_BORDER: Record<InsetCardTone, string> = {
  neutral: 'var(--border)',
  accent: 'var(--accent)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
};

type InsetCardElement = 'div' | 'section' | 'li' | 'p';

export function InsetCard({
  as: Tag = 'div',
  tone = 'neutral',
  fill = false,
  dashed = false,
  roomy = false,
  role,
  id,
  className = '',
  children,
  ...aria
}: {
  as?: InsetCardElement;
  tone?: InsetCardTone;
  fill?: boolean;
  dashed?: boolean;
  /** The Script chapter card's frame (the Studio Next mock): an 8 px radius and 16 px at the sides. */
  roomy?: boolean;
  role?: AriaRole;
  id?: string;
  // Layout only (margin, flex, gap): the look is the card's own.
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) {
  return (
    <Tag
      id={id}
      role={role}
      {...aria}
      className={`border ${roomy ? 'rounded-lg px-4 py-3' : 'rounded-md p-3'} ${dashed ? 'border-dashed' : ''} ${className}`}
      style={{ borderColor: TONE_BORDER[tone], background: fill ? 'var(--surface-2)' : 'var(--surface)' }}
    >
      {children}
    </Tag>
  );
}
