import type { Mark, MarkType } from '../../../../../api/contracts/marks';
import { isAsk } from '../../data/script.selectors';
import { useNoteKeys } from './noteKeys';
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
  /** "markId:messageIndex:n" of the request to edit a message (n is new for each request). */
  editing: string | null;
  lineOf: (mark: Mark) => string;
  actions: NoteActions;
}) {
  const list = [...marks].sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId));
  // A card keeps its state (the reply, who wrote it, the edit being typed) for as long as the note lives: see `useNoteKeys`.
  const { keyOf, idsOf } = useNoteKeys(marks);
  return (
    <div className="flex flex-col gap-2">
      {list.length === 0 ? (
        <p className="m-0 text-[0.88rem] text-balance text-[var(--text-muted)]">No notes in this chapter yet. Select text and choose Mark.</p>
      ) : (
        list.map((mark) => {
          const own = [...idsOf(mark)].find((id) => editing?.startsWith(`${id}:`));
          const at = own !== undefined && editing ? editing.slice(own.length + 1) : null;
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
