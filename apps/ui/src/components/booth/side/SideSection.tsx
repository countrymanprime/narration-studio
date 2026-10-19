import type { ReactNode } from 'react';

/** One titled block of the side panel. */
export function SideSection({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} aria-label={title} className="flex flex-col gap-1.5">
      <h3 className={SIDE_LABEL_CLASS}>{title}</h3>
      {children}
    </section>
  );
}

// The mock's `.bl`: the display font at 12 px, tracked 0.14 em, uppercase. SectionLabel draws the same face at 13 px, so the panel keeps its own size.
export const SIDE_LABEL_CLASS =
  "font-['Barlow_Condensed',sans-serif] text-xs font-semibold tracking-[var(--tracking-label)] text-[var(--text-muted)] uppercase";

// The mock's `.brow`: flat, no border.
export const ROW_CLASS = 'flex items-center gap-2';
export const DIM_CLASS = 'text-[var(--text-muted)]';
