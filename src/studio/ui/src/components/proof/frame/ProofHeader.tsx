import type { ReactNode } from 'react';
import { Heading } from '../../primitives/Heading';
import type { ProofProgress } from '../proof.selectors';

/**
 * The head of the Proof panel: the title, the chapter bar the page passes in, and the one Proof percent as a ring with the two counters.
 * The ring is decorative and the text carries the meaning. With no notes there is neither. When the percent changes the arc eases
 * to it on the base token (`--ring-percent`, registered in styles.css); the counters change at once.
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
            className="size-9 rounded-full motion-ok:transition-[--ring-percent] motion-ok:duration-(--motion-base) motion-ok:ease-(--ease-standard)"
            style={{
              ['--ring-percent' as string]: `${progress.percent}%`,
              background: 'conic-gradient(var(--accent) var(--ring-percent), var(--border) 0)',
              // `closest-side`: the hole is 70% of the ring's own radius; the default (farthest-corner) made it wider than the ring, so the ring
              // drew as a blank gap (alignment audit XPF-3).
              mask: 'radial-gradient(circle closest-side, transparent 70%, #000 71%)',
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
