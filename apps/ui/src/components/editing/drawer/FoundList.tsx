import type { ChapterDoc, FlagKind } from '../model';
import { Button } from '../../primitives/Button';
import { FLAG_KINDS, FLAG_LABEL } from '../flags/flagText';

const NOUN: Record<FlagKind, readonly [string, string]> = {
  extra: ['run of extra words', 'runs of extra words'],
  miss: ['word not read', 'words not read'],
  mis: ['misread word', 'misread words'],
  low: ['word the recogniser was unsure of', 'words the recogniser was unsure of'],
};

/** The words of this chapter that differ from the script, by kind, each a list to step through, never an edit. */
export function FoundList({ doc, activeKind, onReview }: { doc: ChapterDoc; activeKind: FlagKind | null; onReview: (kind: FlagKind) => void }) {
  return (
    <section aria-label="Found in this chapter" className="flex flex-col gap-2 border-b border-[var(--border)] p-3">
      <span className="font-['Barlow_Condensed',sans-serif] text-[11px] font-semibold tracking-[var(--tracking-button)] text-[var(--text-muted)] uppercase">
        Found in this chapter
      </span>
      <ul id="dr-found" className="m-0 flex list-none flex-col gap-1 p-0">
        {FLAG_KINDS.map((k) => {
          const n = doc.counts[k];
          return (
            <li
              key={k}
              data-found={k}
              data-on={activeKind === k || undefined}
              className="flex items-center gap-2 rounded-[var(--radius-button)] px-2 py-1 data-[on]:bg-[var(--accent-soft)]"
            >
              <span className="flex-1">
                {FLAG_LABEL[k][0]}
                <br />
                <span className="text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
                  {n} {NOUN[k][n === 1 ? 0 : 1]}
                </span>
              </span>
              <Button variant="secondary" size="sm" disabled={n === 0} aria-label={`Review ${FLAG_LABEL[k][0].toLowerCase()}`} onClick={() => onReview(k)}>
                Review
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
