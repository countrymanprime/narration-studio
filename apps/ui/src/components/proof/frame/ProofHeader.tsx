import type { ReactNode } from 'react';
import { Heading } from '../../primitives/Heading';
import type { ProofProgress } from '../proof.selectors';

/**
 * The head of the Proof panel: the title, the chapter bar the page passes in, and the one Proof percent as a ring with the two counters.
 * The ring is decorative and the text carries the meaning. With no notes there is neither.
 */
export function ProofHeader({ progress, chapterBar }: { progress: ProofProgress; chapterBar: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Heading title="Proof" />
      {chapterBar}
      <span className="flex-1" />
      {progress.total > 0 ? (
        <div className="flex items-center gap-2 text-sm">
          <div
            aria-hidden="true"
            data-ring={progress.percent}
            className="size-6 rounded-full"
            style={{
              background: `conic-gradient(var(--accent) ${progress.percent}%, var(--border) 0)`,
              mask: 'radial-gradient(circle, transparent 55%, #000 56%)',
            }}
          />
          <span>
            <b className="text-[var(--text)]">
              {progress.cleared} of {progress.total}
            </b>{' '}
            <span className="text-[var(--text-muted)]">cleared</span> <span className="text-[var(--text-muted)]">· {progress.decided} decided</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
