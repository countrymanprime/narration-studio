import type { HTMLAttributes, ReactNode } from 'react';

// The one marker for a boundary in the reading: a dashed rule each side of a small caps label, "End of Chapter 7 · 2,044 words"
// between two chapters on the Script page and "Page 12" at a page break in the Booth. One primitive draws both so a break and a
// chapter end cannot drift (frontend-primitives rule 3). `variant` only names which boundary it is; both draw the same.
export type BoundaryVariant = 'chapterEnd' | 'page';

export function BoundaryMarker({
  variant,
  children,
  className = '',
  ...rest
}: { variant: BoundaryVariant; children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLDivElement>, 'children'>) {
  return (
    <div
      data-boundary={variant}
      className={`flex items-center gap-3 font-['Barlow_Condensed',sans-serif] text-xs font-semibold tracking-[0.16em] text-[var(--text-muted)] uppercase before:flex-1 before:border-t-2 before:border-dashed before:border-[var(--line-strong)] before:content-[''] after:flex-1 after:border-t-2 after:border-dashed after:border-[var(--line-strong)] after:content-[''] ${className}`}
      {...rest}
    >
      <span>{children}</span>
    </div>
  );
}
