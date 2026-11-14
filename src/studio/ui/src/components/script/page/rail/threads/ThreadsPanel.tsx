import type { Mark, MarkType } from '../../../../../api/contracts/marks';
import { isAsk } from '../../data/script.selectors';
import { NoteCard, type NoteActions } from './NoteCard';

/**
 * The Notes tab: a card per mark, the selected one first. Every mark is a threaded note that can be replied to, whatever its type;
 * the page decides which marks those are, this only shows them.
 */
export function ThreadsPanel({
  marks,
  types,
  selectedId,
  editing,
  lineOf,
  actions,
}: {
  marks: readonly Mark[];
  types: readonly MarkType[];
  selectedId: string | null;
  /** "markId:messageIndex" of the message being edited. */
  editing: string | null;
  lineOf: (mark: Mark) => string;
  actions: NoteActions;
}) {
  const list = [...marks].sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId));
  // A card is the note on its passage, not its id or its type: clearing or rewriting a note's opening message replaces the mark with a new id, changing its Type
  // is a change of the mark and not of the card, and a reply typed under it is the narrator's either way, so the card keeps its place and its text (#3404).
  // Two notes on the same passage are told apart by their order in the list as the page gives it, never the display order (the selected note is drawn first),
  // so selecting one never hands its state to the other (#3400, qa-breaker on #3458). This is an internal keying choice, not a behaviour the narrator chooses.
  const seen = new Map<string, number>();
  const keys = new Map<Mark, string>();
  for (const mark of marks) {
    const base = `${mark.chapterId}:${mark.paragraphId}:${mark.start}-${mark.end}`;
    const nth = seen.get(base) ?? 0;
    seen.set(base, nth + 1);
    keys.set(mark, `${base}#${nth}`);
  }
  const keyOf = (mark: Mark): string => keys.get(mark)!;
  return (
    <div className="flex flex-col gap-2">
      {list.length === 0 ? (
        <p className="m-0 text-[0.88rem] text-balance text-[var(--text-muted)]">No notes in this chapter yet. Select text and choose Mark.</p>
      ) : (
        list.map((mark) => {
          const at = editing?.startsWith(`${mark.id}:`) ? Number(editing.slice(mark.id.length + 1)) : null;
          return (
            <NoteCard
              key={keyOf(mark)}
              mark={mark}
              types={types}
              asks={isAsk(types, mark)}
              line={lineOf(mark)}
              active={mark.id === selectedId}
              editing={at}
              actions={actions}
            />
          );
        })
      )}
    </div>
  );
}
