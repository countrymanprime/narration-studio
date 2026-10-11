import { useEffect, useRef, useState } from 'react';
import type { Mark, MarkThreadAuthor, MarkType } from '../../../../../api/contracts/marks';
import { overlay } from '../../../../../overlay/overlayService';
import { Button } from '../../../../primitives/Button';
import { IconButton } from '../../../../primitives/IconButton';
import { Select } from '../../../../primitives/Select';
import { StatusBadge } from '../../../../primitives/StatusBadge';
import { Swatch } from '../../../../primitives/Swatch';
import { ToggleGroup } from '../../../../primitives/ToggleGroup';
import { markMessages } from '../../data/script.selectors';
import { markSwatch } from './markSwatch';
import { MessageEditor } from './MessageEditor';
import { NoteTextarea } from './NoteTextarea';

/** What a card does to its mark. Each call names the mark; the ones that write answer whether the host took the change. */
export type NoteActions = {
  onType: (id: string, type: string) => unknown;
  onShow: (id: string) => void;
  onCopy: (mark: Mark) => unknown;
  onDelete: (id: string) => unknown;
  onReply: (id: string, who: MarkThreadAuthor, text: string) => Promise<boolean>;
  onResolve: (id: string, who: MarkThreadAuthor, text: string) => Promise<boolean>;
  onReopen: (id: string) => unknown;
  onEdit: (id: string, index: number) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, index: number, text: string) => Promise<boolean>;
  onDeleteMessage: (id: string, index: number) => unknown;
};

const WHO_LABEL: Record<MarkThreadAuthor, string> = { you: 'You', author: 'Author', proofer: 'Proofer' };

/** The host's UTC time as the narrator reads it; a time that does not parse shows nothing. */
function when(at: string): string {
  const date = new Date(at);
  return at && !Number.isNaN(date.getTime()) ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

/**
 * A note and a query are the same thing: a thread on a passage. A query also tracks the author's reply and can be resolved.
 * The reply box and the who-select are the card's own; everything that changes the mark goes out through `actions`.
 */
export function NoteCard({
  mark,
  types,
  asks,
  line,
  active,
  editing,
  actions,
}: {
  mark: Mark;
  types: readonly MarkType[];
  asks: boolean;
  /** Where the mark is, as the page says it ("Chapter 3 · ¶ 4"). */
  line: string;
  /** The mark the reader selected. */
  active: boolean;
  /** The index of the message being edited (-1 is the opening message), or null. */
  editing: number | null;
  actions: NoteActions;
}) {
  const [reply, setReply] = useState('');
  const [who, setWho] = useState<MarkThreadAuthor>(asks ? 'author' : 'you');
  const ref = useRef<HTMLElement>(null);
  const type = types.find((row) => row.key === mark.type);
  const resolved = mark.status === 'resolved';
  const messages = markMessages(mark);
  const quote = mark.quote.trim();

  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const send = async (act: NoteActions['onReply']) => {
    if (await act(mark.id, who, reply.trim())) setReply('');
  };
  const addReply = () => {
    if (!reply.trim()) {
      overlay.toast('Write the reply or note first.');
      return;
    }
    void send(actions.onReply);
  };

  return (
    <article
      ref={ref}
      aria-label={`${type?.name ?? 'Note'}: ${quote || line}`}
      aria-current={active ? 'true' : undefined}
      data-mark={mark.id}
      className={`${active ? 'a-active border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--surface)]'} flex flex-col gap-2 rounded-lg border p-3`}
    >
      <div className="flex items-center gap-1.5">
        {type && <Swatch colour={markSwatch(type.colour)} size={14} />}
        <Select
          label="Type"
          className="min-w-0 flex-1"
          value={mark.type}
          onChange={(value) => void actions.onType(mark.id, value)}
          options={types.map((row) => ({ value: row.key, label: row.name }))}
        />
        {asks && <StatusBadge tone={resolved ? 'success' : 'warning'} label={resolved ? 'Resolved' : 'Open'} />}
        <IconButton action="locate" size="sm" onClick={() => actions.onShow(mark.id)} />
        {asks && <IconButton action="copyQuery" size="sm" onClick={() => void actions.onCopy(mark)} />}
        <IconButton action="deleteNote" size="sm" variant="danger" onClick={() => void actions.onDelete(mark.id)} />
      </div>
      <blockquote className="m-0 font-serif text-[0.88rem] text-[var(--text)]">{quote ? `“${quote}”` : null}</blockquote>
      <div className="text-[0.8rem] text-[var(--text-muted)]">{line}</div>
      {messages.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {messages.map((message) => (
            <li key={message.index} className="flex flex-col gap-0.5 rounded-md bg-[var(--bg)] px-2 py-1.5 text-[0.88rem]">
              {editing === message.index ? (
                <MessageEditor initial={message.text} onCancel={actions.onCancelEdit} onSave={(text) => actions.onSaveEdit(mark.id, message.index, text)} />
              ) : (
                <>
                  <span className="text-[0.72rem] font-semibold text-[var(--text-muted)] uppercase">{WHO_LABEL[message.who]}</span>
                  <span className="[overflow-wrap:anywhere] whitespace-pre-wrap">{message.text}</span>
                  <span className="flex items-center justify-between gap-1 text-[0.75rem] text-[var(--text-muted)]">
                    {when(message.at)}
                    <span className="flex gap-0.5">
                      <IconButton action="editMessage" size="sm" onClick={() => actions.onEdit(mark.id, message.index)} />
                      <IconButton action="deleteMessage" size="sm" variant="danger" onClick={() => void actions.onDeleteMessage(mark.id, message.index)} />
                    </span>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {asks && resolved ? (
        <div className="flex">
          <Button variant="secondary" size="sm" onClick={() => void actions.onReopen(mark.id)}>
            Reopen
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {asks && (
            <ToggleGroup
              label="Who wrote this"
              look="segmented"
              value={who}
              onChange={(value) => setWho(value as MarkThreadAuthor)}
              options={[
                { value: 'author', label: 'Author replied' },
                { value: 'you', label: 'My note' },
              ]}
            />
          )}
          <NoteTextarea
            aria-label={asks ? 'Reply or note' : 'Add to this note'}
            placeholder={asks ? 'Paste the reply, or add a note' : messages.length ? 'Add to this note' : 'Write a note'}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
          />
          <div className="flex gap-1.5">
            <Button variant="secondary" size="sm" onClick={addReply}>
              Reply
            </Button>
            {asks && (
              <Button size="sm" onClick={() => void send(actions.onResolve)}>
                Mark resolved
              </Button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
