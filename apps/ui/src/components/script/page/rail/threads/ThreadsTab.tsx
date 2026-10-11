import { useMemo } from 'react';
import type { Mark } from '../../../../../api/contracts/marks';
import { overlay } from '../../../../../overlay/overlayService';
import { useJournal } from '../../../../../studio/StudioProvider';
import { Button } from '../../../../primitives/Button';
import { isAsk } from '../../data/script.selectors';
import { useMarks, useScriptCommands, useScriptView } from '../../data/useScriptData';
import type { NoteActions } from './NoteCard';
import { copyQuery } from './copyQuery';
import { ThreadsPanel } from './ThreadsPanel';

export type ThreadsTabProps = {
  /** Notes are the chapter's marks whose type does not ask; queries are the asking marks of the book. */
  kind: 'notes' | 'queries';
  chapterId: string;
  /** Where a mark is, as the page says it ("Chapter 3 · ¶ 4"). */
  lineOf: (mark: Mark) => string;
  /** The reader scrolls to the mark. */
  onShowInText: (id: string) => void;
};

/** The Notes and Queries tabs of the Script rail: two views of the marks, over the page's data layer. */
export function ThreadsTab({ kind, chapterId, lineOf, onShowInText }: ThreadsTabProps) {
  const marks = useMarks();
  const commands = useScriptCommands();
  const journal = useJournal();
  const [selectedId, update] = useScriptView((state) => state.sel);
  const [filter] = useScriptView((state) => state.qfilter);
  const [editing] = useScriptView((state) => state.aedit);

  const shown = useMemo(
    () =>
      kind === 'queries' ? marks.marks.filter((mark) => isAsk(marks.types, mark)) : marks.inChapter(chapterId).filter((mark) => !isAsk(marks.types, mark)),
    [kind, chapterId, marks],
  );

  const actions = useMemo<NoteActions>(
    () => ({
      onType: (id, type) => commands.setMarkType(id, type),
      onShow(id) {
        update({ sel: id });
        onShowInText(id);
      },
      onCopy: (mark) => copyQuery(lineOf(mark), mark),
      async onDelete(id) {
        if (!(await commands.removeMark(id))) return;
        // The data layer's removeMark does not offer Undo itself; the entry it just journalled is the newest.
        const [entry] = await journal.entries();
        if (!entry) return;
        overlay.toastUndo('Note deleted.', async () => {
          const undone = await journal.undo(entry.id);
          return undone.ok ? { ok: true } : undone;
        });
      },
      onReply: async (id, who, text) => (await commands.reply(id, who, text)) !== null,
      onResolve: (id, who, text) => commands.resolve(id, who, text),
      onReopen: (id) => commands.setStatus(id, 'open'),
      onEdit: (id, index) => update({ aedit: `${id}:${index}` }),
      onCancelEdit: () => update({ aedit: null }),
      async onSaveEdit(id, index, text) {
        const saved = await commands.editMessage(id, index, text);
        if (saved) update({ aedit: null });
        return saved;
      },
      onDeleteMessage: (id, index) => commands.deleteMessage(id, index),
    }),
    [commands, journal, update, onShowInText, lineOf],
  );

  if (marks.status === 'error' && marks.value === undefined) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-3 text-[0.88rem]">
        <span>{marks.message}</span>
        <Button variant="secondary" size="sm" onClick={marks.retry}>
          Retry
        </Button>
      </div>
    );
  }
  return (
    <ThreadsPanel
      kind={kind}
      marks={shown}
      types={marks.types}
      filter={filter}
      onFilter={(next) => update({ qfilter: next })}
      selectedId={selectedId}
      editing={editing}
      lineOf={lineOf}
      actions={actions}
    />
  );
}
