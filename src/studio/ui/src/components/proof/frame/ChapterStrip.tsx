import { creditsKindOfId } from '../../credits/creditsEntries';

/** One chapter's tile: `number` is null for the unnumbered first and last (Open / Close). `open` of `total` notes are still open. */
export type StripChapter = { id: string; name: string; number: number | null; total: number; open: number };

/** The strip is dense (a dot per chapter) once the book has more chapters than fit as tiles. */
const STRIP_DENSE_OVER = 18;

const stripIsDense = (chapters: readonly StripChapter[]): boolean => chapters.length > STRIP_DENSE_OVER;

/** What a tile says: the chapter number (every fifth when dense), or Open / Close (In / Out when dense) for the unnumbered ends. */
function stripLabel(chapters: readonly StripChapter[], chapter: StripChapter, dense: boolean): string {
  if (chapter.number != null) return !dense || chapter.number % 5 === 0 ? String(chapter.number) : '';
  // Which end a tile is follows its credits id, not its place: a book with only the closing credits still says Close.
  const kind = creditsKindOfId(chapter.id);
  const first = kind ? kind === 'opening' : chapters[0]?.id === chapter.id;
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
  // Tiles keep 28 px (a press target, room for a number) and the strip scrolls sideways, with its edge cue, instead of squeezing them to
  // slivers (alignment audit XPF-11, R3PF-5). The unnumbered ends are 48 px so Open and Close fit whole at any width: "In" read as a word
  // of the sentence, not an end of the book (#2635).
  return (
    <div className="scroll-x-edges @container w-full [scrollbar-gutter:auto] overflow-x-auto">
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
              className={`flex flex-1 flex-col ${dense ? 'min-w-0' : chapter.number == null ? 'min-w-12' : 'min-w-7'} items-center justify-center rounded border bg-[var(--surface)] text-xs ${dense ? 'h-10 px-0' : 'h-[54px] px-1'} ${STATE_CLASS[state]} ${isCurrent ? 'bg-[var(--accent-soft)] font-semibold outline-2 outline-offset-1 outline-[var(--accent)]' : ''}`}
            >
              {/* The number and count are drawn as generated content from data-text: they abbreviate the name ("1", "Open"), and
                drawn as text axe's label-content-name-mismatch would require the name to hold them word for word. */}
              <span className="h-4 truncate before:content-[attr(data-text)]" data-text={stripLabel(chapters, chapter, dense)} />
              <b className="before:content-[attr(data-text)]" data-text={count} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
