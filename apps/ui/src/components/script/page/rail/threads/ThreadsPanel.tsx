import type { Mark, MarkType } from '../../../../../api/contracts/marks';
import { ToggleGroup } from '../../../../primitives/ToggleGroup';
import { isAsk } from '../../data/script.selectors';
import { NoteCard, type NoteActions } from './NoteCard';

export type QueryFilter = 'open' | 'resolved' | 'all';

/** The text of an empty tab, as the mock words it. */
const EMPTY = { notes: 'No notes in this chapter yet. Select text and choose Mark.', queries: 'No queries here.' };

/**
 * The Notes tab or the Queries tab: a card per mark, the selected one first. A query list has the Open / Resolved / All filter
 * over the marks it is given. The page decides which marks those are; this only shows them.
 */
export function ThreadsPanel({
  kind,
  marks,
  types,
  filter,
  onFilter,
  selectedId,
  editing,
  lineOf,
  actions,
}: {
  kind: 'notes' | 'queries';
  marks: readonly Mark[];
  types: readonly MarkType[];
  filter: QueryFilter;
  onFilter: (filter: QueryFilter) => void;
  selectedId: string | null;
  /** "markId:messageIndex" of the message being edited. */
  editing: string | null;
  lineOf: (mark: Mark) => string;
  actions: NoteActions;
}) {
  const queries = kind === 'queries';
  const open = marks.filter((mark) => mark.status !== 'resolved').length;
  const shown = queries && filter !== 'all' ? marks.filter((mark) => (mark.status === 'resolved') === (filter === 'resolved')) : marks;
  const list = [...shown].sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId));
  return (
    <div className="flex flex-col gap-2">
      {queries && (
        <ToggleGroup
          label="Show"
          look="segmented"
          value={filter}
          onChange={(value) => onFilter(value as QueryFilter)}
          options={[
            { value: 'open', label: `Open ${open}` },
            { value: 'resolved', label: `Resolved ${marks.length - open}` },
            { value: 'all', label: 'All' },
          ]}
        />
      )}
      {list.length === 0 ? (
        <p className="m-0 p-3 text-[0.88rem] text-[var(--text-muted)]">{EMPTY[kind]}</p>
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
