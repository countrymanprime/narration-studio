import type { ReactNode } from 'react';

/** One titled block of the side panel. */
export function SideSection({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} aria-label={title} className="flex flex-col gap-1.5">
      <h3 className="font-['Barlow_Condensed',sans-serif] text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)] uppercase">{title}</h3>
      {children}
    </section>
  );
}

export const ROW_CLASS = 'flex items-center gap-2';
export const DIM_CLASS = 'text-[var(--text-muted)]';
