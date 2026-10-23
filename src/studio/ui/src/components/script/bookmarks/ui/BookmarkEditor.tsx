import { useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { BOOKMARK_LABEL_MAX, BOOKMARK_NOTE_MAX, type Bookmark } from '../../../../api/contracts/bookmarks';
import { IconButton } from '../../../primitives/IconButton';
import { Popover } from '../../../primitives/Popover';
import { TextField } from '../../../primitives/TextField';

export type BookmarkEditorProps = {
  bookmark: Bookmark;
  /** The words the mark sits on, shown above the fields. */
  snippet: string;
  /** The element that opens the editor (a ribbon, or a row's pencil). It takes the focus back when the editor closes. */
  trigger: ReactElement;
  /** Saves label and note as one change. Called once per edit, and never when nothing changed. */
  onUpdate: (id: string, label: string, note: string) => unknown;
  onRemove: (id: string) => unknown;
};

/** A counter shows from here to the limit, so the narrator sees the end coming. */
const NEAR = 0.8;

function Count({ length, max }: { length: number; max: number }) {
  if (length < max * NEAR) return null;
  return <span className="block text-right text-xs text-[var(--text-muted)]">{`${length}/${max}`}</span>;
}

const FOCUSABLE = 'button, input, textarea, [href], [tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside the popover: from the last control it wraps to the first, and Shift+Tab the other way. */
function trapTab(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled'));
  if (items.length === 0) return;
  const edge = event.shiftKey ? items[0] : items[items.length - 1];
  if (document.activeElement === edge) {
    event.preventDefault();
    (event.shiftKey ? items[items.length - 1] : items[0]).focus();
  }
}

/**
 * The editor of one bookmark in a popover: its words, a delete icon, a label (up to 60) and a note (up to 500). Typing is a draft; it
 * is saved as one change when a field loses focus or the popover closes, so one edit is one undo step. Enter in the label closes.
 */
export function BookmarkEditor({ bookmark, snippet, trigger, onUpdate, onRemove }: BookmarkEditorProps) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(bookmark.label);
  const [note, setNote] = useState(bookmark.note);
  // What the host holds now, so a blur followed by a close saves once.
  const saved = useRef({ label: bookmark.label, note: bookmark.note });
  const draft = useRef({ label, note });
  draft.current = { label, note };
  // Set while the delete icon is pressed, so the blur it causes does not save a draft of a bookmark that is going.
  const deleting = useRef(false);

  const save = (): void => {
    const next = draft.current;
    if (deleting.current) return;
    if (next.label === saved.current.label && next.note === saved.current.note) return;
    saved.current = next;
    void onUpdate(bookmark.id, next.label, next.note);
  };

  const change = (next: boolean): void => {
    if (next) {
      saved.current = { label: bookmark.label, note: bookmark.note };
      setLabel(bookmark.label);
      setNote(bookmark.note);
      deleting.current = false;
    } else {
      save();
    }
    setOpen(next);
  };

  const remove = (): void => {
    deleting.current = true;
    setOpen(false);
    void onRemove(bookmark.id);
  };

  return (
    <Popover trigger={trigger} label="Edit bookmark" side="bottom" align="start" open={open} onOpenChange={change}>
      <div className="flex w-[min(20rem,calc(100vw-3rem))] flex-col gap-2" onKeyDown={trapTab}>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-serif text-[0.8rem] text-[var(--text-muted)] italic">
            {snippet ? `“${snippet}”` : 'This line has changed'}
          </span>
          <IconButton
            action="deleteBookmark"
            label="Delete bookmark"
            variant="danger"
            size="sm"
            onPointerDown={() => (deleting.current = true)}
            onPointerLeave={() => (deleting.current = false)}
            onClick={remove}
          />
        </div>
        <div>
          <TextField
            label="Label"
            placeholder="Label"
            maxLength={BOOKMARK_LABEL_MAX}
            value={label}
            onChange={setLabel}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                change(false);
              }
            }}
          />
          <Count length={label.length} max={BOOKMARK_LABEL_MAX} />
        </div>
        <div>
          {/* native-control-ok: Field's textarea has no length limit or blur-to-save, and no primitive offers a bare textarea */}
          <textarea
            aria-label="Note"
            placeholder="Note"
            maxLength={BOOKMARK_NOTE_MAX}
            autoFocus
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={save}
            className="box-border min-h-20 w-full rounded-[var(--control-radius)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-[0.6rem] text-[0.88rem] leading-[1.35] text-[var(--text)]"
          />
          <Count length={note.length} max={BOOKMARK_NOTE_MAX} />
        </div>
      </div>
    </Popover>
  );
}
