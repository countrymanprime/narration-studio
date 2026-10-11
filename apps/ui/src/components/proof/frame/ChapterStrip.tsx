/** One chapter's tile: `number` is null for the unnumbered first and last (Open / Close). `open` of `total` notes are still open. */
export type StripChapter = { id: string; name: string; number: number | null; total: number; open: number };

/** The strip is dense (a dot per chapter) once the book has more chapters than fit as tiles. */
const STRIP_DENSE_OVER = 18;

const stripIsDense = (chapters: readonly StripChapter[]): boolean => chapters.length > STRIP_DENSE_OVER;

/** What a tile says: the chapter number (every fifth when dense), or Open / Close (In / Out when dense) for the unnumbered ends. */
function stripLabel(chapters: readonly StripChapter[], chapter: StripChapter, dense: boolean): string {
  if (chapter.number != null) return !dense || chapter.number % 5 === 0 ? String(chapter.number) : '';
  const first = chapters[0]?.id === chapter.id;
  return dense ? (first ? 'In' : 'Out') : first ? 'Open' : 'Close';
}

const STATE_CLASS = {
  open: 'border-[var(--accent)] text-[var(--accent-strong)]',
  clear: 'border-[var(--ok)] text-[var(--ok-text)]',
  none: 'border-[var(--border)] text-[var(--text-muted)]',
} as const;

/** Notes still to review, chapter by chapter. A click opens the chapter. */
export function ChapterStrip({
  chapters,
  current,
  onChooseChapter,
}: {
  chapters: readonly StripChapter[];
  current: string;
  onChooseChapter: (id: string) => void;
}) {
  const dense = stripIsDense(chapters);
  return (
    <div role="group" aria-label="Open notes by chapter" data-dense={dense || undefined} className={`flex w-full ${dense ? 'gap-px' : 'gap-1'}`}>
      {chapters.map((chapter) => {
        const state = chapter.total ? (chapter.open ? 'open' : 'clear') : 'none';
        const name = `${chapter.name}: ${chapter.total ? `${chapter.open} open of ${chapter.total}` : 'no notes'}`;
        const isCurrent = chapter.id === current;
        const count = chapter.total ? (dense ? '●' : String(chapter.open)) : dense ? '' : '—';
        return (
          // native-control-ok: a tile is a numbered chapter mark sized by the strip (a dot when dense); Button has no such shape.
          <button
            key={chapter.id}
            type="button"
            aria-label={name}
            title={name}
            aria-current={isCurrent ? 'true' : undefined}
            data-state={state}
            data-current={isCurrent || undefined}
            onClick={() => onChooseChapter(chapter.id)}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded border bg-[var(--surface)] text-xs ${dense ? 'h-10 px-0' : 'h-12 px-1'} ${STATE_CLASS[state]} ${isCurrent ? 'bg-[var(--accent-soft)] font-semibold' : ''}`}
          >
            <span className="h-4 truncate">{stripLabel(chapters, chapter, dense)}</span>
            <b>{count}</b>
          </button>
        );
      })}
    </div>
  );
}
