import type { ReactNode } from 'react';

/**
 * A category's title and blurb, the target of `settings-heading`. Loading, a category, Models & downloads and Set on a page draw the same
 * block, so the title does not move when the settings arrive. It is a section title, smaller than the page's own "Settings" (one page
 * title, rule 2). `action` sits at the right of the title line (Reset to defaults).
 */
export function PaneTitle({ title, blurb, action }: { title: string; blurb?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="settings-heading" tabIndex={-1} className="m-0 text-[1.125rem] leading-tight font-semibold outline-none">
          {title}
        </h2>
        {blurb && <p className="m-0 max-w-[62ch] text-[0.8125rem] text-[var(--text-muted)]">{blurb}</p>}
      </div>
      {action}
    </div>
  );
}
