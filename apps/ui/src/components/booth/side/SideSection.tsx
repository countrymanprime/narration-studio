import type { ReactNode } from 'react';

/** One titled block of the side panel. */
export function SideSection({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} aria-label={title} className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">{title}</h3>
      {children}
    </section>
  );
}

export const ROW_CLASS = 'flex items-center gap-2 rounded-[var(--radius-control,6px)] border border-[var(--line)] px-2 py-1.5 text-sm';
export const DIM_CLASS = 'text-sm text-[var(--text-muted)]';
