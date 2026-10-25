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
  return (
    <div className="flex flex-col gap-2">
      {list.length === 0 ? (
        <p className="m-0 text-[0.88rem] text-balance text-[var(--text-muted)]">No notes in this chapter yet. Select text and choose Mark.</p>
      ) : (
        list.map((mark) => {
          const at = editing?.startsWith(`${mark.id}:`) ? Number(editing.slice(mark.id.length + 1)) : null;
          return (
            <NoteCard
              key={mark.id}
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
