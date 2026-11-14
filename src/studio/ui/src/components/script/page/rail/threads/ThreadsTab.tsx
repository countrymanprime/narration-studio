import { useMemo, useRef } from 'react';
import type { Mark } from '../../../../../api/contracts/marks';
import { overlay } from '../../../../../overlay/overlayService';
import { useJournal } from '../../../../../studio/StudioProvider';
import { Button } from '../../../../primitives/Button';
import { useGuardedAction, useUnsavedDrafts } from '../../../../../studio/drafts/unsavedDrafts';
import { useMarks, useScriptCommands, useScriptView } from '../../data/useScriptData';
import type { NoteActions } from './NoteCard';
import { copyQuery } from './copyQuery';
import { ThreadsPanel } from './ThreadsPanel';
import { keepFocusOnRemoval } from '../../../../layout/keepFocusOnRemoval';

export type ThreadsTabProps = {
  chapterId: string;
  /** Where a mark is, as the page says it ("Chapter 3 · ¶ 4"). */
  lineOf: (mark: Mark) => string;
  /** The reader scrolls to the mark. */
  onShowInText: (id: string) => void;
};

/** The Notes tab of the Script rail: the chapter's marks, over the page's data layer. */
export function ThreadsTab({ chapterId, lineOf, onShowInText }: ThreadsTabProps) {
  const marks = useMarks();
  const commands = useScriptCommands();
  const journal = useJournal();
  const [selectedId, update] = useScriptView((state) => state.sel);
  const [editing] = useScriptView((state) => state.aedit);
  // Editing another message replaces the editor that holds a typed edit, so it asks first (#3404).
  const guarded = useGuardedAction();

  // The list is the chapter in view, and the reader scrolling into the next one would unmount the card that holds a reply or an edit being typed. A chapter that
  // holds one stays the chapter shown until it is added, saved or discarded (#3400, qa-breaker on #3458).
  const drafts = useUnsavedDrafts();
  const holdsNote = drafts.heldNow().some((held) => held.kind === 'script-note-reply' || held.kind === 'script-note-edit');
  const lastShown = useRef(chapterId);
  const shownChapter = holdsNote ? lastShown.current : chapterId;
  lastShown.current = shownChapter;
  const shown = useMemo(() => marks.inChapter(shownChapter), [shownChapter, marks]);

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
        overlay.toastUndo(
          'Note deleted.',
          async () => {
            const undone = await journal.undo(entry.id);
            return undone.ok ? { ok: true } : undone;
          },
          { entry: entry.id },
        );
      },
      onReply: async (id, who, text) => (await commands.reply(id, who, text)) !== null,
      onResolve: (id, who, text) => commands.resolve(id, who, text),
      onReopen: (id) => commands.setStatus(id, 'open'),
      onEdit: (id, index) => guarded(() => update({ aedit: `${id}:${index}` })),
      onCancelEdit: () => update({ aedit: null }),
      async onSaveEdit(id, index, text) {
        const saved = await commands.editMessage(id, index, text);
        if (saved) update({ aedit: null });
        return saved;
      },
      onDeleteMessage: (id, index) =>
        // The editor of a message below the one deleted would sit on the next message with its typed text and Save onto it, so a delete above an edit being typed
        // asks first, and the open edit moves up with its message (or closes when it is the one deleted) (#3400, qa-breaker on #3458).
        guarded(() => {
          void (async () => {
            const deleted = await commands.deleteMessage(id, index);
            if (!deleted || index < 0) return;
            update((state) => {
              const at = state.aedit?.lastIndexOf(':') ?? -1;
              if (!state.aedit || at < 0 || state.aedit.slice(0, at) !== id) return {};
              const editIndex = Number(state.aedit.slice(at + 1));
              if (editIndex === index) return { aedit: null };
              return editIndex > index ? { aedit: `${id}:${editIndex - 1}` } : {};
            });
          })();
        }),
    }),
    [commands, journal, update, onShowInText, lineOf, guarded],
  );

  if (marks.status === 'error' && marks.value === undefined) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-3 text-[0.88rem]">
        <span>{marks.message}</span>
        <Button ref={keepFocusOnRemoval} variant="secondary" size="sm" onClick={marks.retry}>
          Retry
        </Button>
      </div>
    );
  }
  return <ThreadsPanel marks={shown} types={marks.types} selectedId={selectedId} editing={editing} lineOf={lineOf} actions={actions} />;
}
