import type { ReactNode } from 'react';
import { Heading } from '../../primitives/Heading';
import { Panel } from '../../primitives/Panel';

/**
 * The Booth's one frame for a page with nothing to read (credits not set up, a chapter the book lacks, no chapters) and for a read that
 * failed (`LoadError`, which draws the same): the page gutter, the "Booth" title, then a panel that says what is missing with its buttons
 * under the sentence, left-aligned. The Booth fills the window with no shell around it, so it brings its own gutter (alignment audit
 * XBO-15, R4BO1-6).
 */
export function BoothMessage({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <BoothGutter>
      <div className="max-w-3xl space-y-4">
        <Heading title="Booth" />
        <Panel title={title}>
          <p className="m-0 text-sm text-[var(--text-muted)]">{children}</p>
          {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
        </Panel>
      </div>
    </BoothGutter>
  );
}

/** The page gutter the app shell gives every other page; the Booth has no shell. */
export function BoothGutter({ children }: { children: ReactNode }) {
  return <div className="p-[var(--page-gutter)]">{children}</div>;
}
