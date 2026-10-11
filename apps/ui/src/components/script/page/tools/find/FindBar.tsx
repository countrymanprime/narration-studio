import { useEffect, useRef } from 'react';
import { IconButton } from '../../../../primitives/IconButton';
import { TextField } from '../../../../primitives/TextField';
import { findCountText, type FindState } from './findState';
import { FIND_LIST_LIMIT, type FindMatch } from './searchManuscript';

// The Script page's Find bar (the mock's `FindBar`): a box, "3 of 12", previous, next, the result list and close, under the
// reader's header. Enter and Shift+Enter step, Escape closes. Controlled: `useFind` binds it to the page's view state, and the
// reader draws the highlights from `matches` and `find.i`. It renders nothing while closed.
export function FindBar({
  find,
  nonce,
  matches,
  locationOf,
  onQuery,
  onStep,
  onPick,
  onToggleList,
  onClose,
  returnFocus,
}: {
  find: FindState;
  /** Counts up each time Find is asked for, so the box takes focus again even when it is already open. */
  nonce: number;
  matches: readonly FindMatch[];
  /** Where a match is, for its row ("Chapter 3 · ¶ 12"). */
  locationOf: (match: FindMatch) => string;
  onQuery: (query: string) => void;
  onStep: (delta: 1 | -1) => void;
  onPick: (index: number) => void;
  onToggleList: () => void;
  onClose: () => void;
  /** Moves focus back to the reader once Find closes or a result is chosen. */
  returnFocus: () => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const current = useRef<HTMLButtonElement>(null);
  const count = matches.length;
  const listShown = find.open && find.list && count > 0;

  useEffect(() => {
    if (!find.open) return;
    field.current?.focus();
    field.current?.select();
  }, [find.open, nonce]);
  useEffect(() => {
    if (listShown) current.current?.scrollIntoView?.({ block: 'nearest' });
  }, [listShown, find.i]);

  if (!find.open) return null;
  const close = () => {
    onClose();
    returnFocus();
  };
  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2" role="search" aria-label="Find in the manuscript">
      <div className="flex flex-nowrap items-center gap-2">
        <TextField
          ref={field}
          label="Find in the manuscript"
          placeholder="Find in the manuscript"
          value={find.q}
          onChange={onQuery}
          onFocus={() => {
            if (!find.list && count) onToggleList();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onStep(event.shiftKey ? -1 : 1);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        />
        <span role="status" className="font-mono text-[13px] whitespace-nowrap text-[var(--text-muted)]">
          {findCountText(find, count)}
        </span>
        <IconButton action="previous" label="Previous match (Shift+Enter)" onClick={() => onStep(-1)} />
        <IconButton action="next" label="Next match (Enter)" onClick={() => onStep(1)} />
        <IconButton action="list" label="Results" aria-expanded={listShown} onClick={onToggleList} />
        <IconButton action="close" label="Close search (Esc)" onClick={close} />
      </div>
      {listShown ? (
        <div className="mt-1.5 max-h-[220px] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]" aria-label="Search results">
          {matches.slice(0, FIND_LIST_LIMIT).map((match, index) => (
            // native-control-ok: a result row is a whole-width button holding its location and snippet, which IconButton and Button cannot draw.
            <button
              key={`${match.paragraphId}:${match.start}`}
              ref={index === find.i ? current : undefined}
              type="button"
              aria-current={index === find.i ? 'true' : undefined}
              className="flex w-full gap-2.5 border-b border-[var(--border)] px-2.5 py-1.5 text-left text-[13px] last:border-b-0 hover:bg-[var(--surface-2)] aria-[current=true]:bg-[var(--accent-soft)]"
              onClick={() => {
                onPick(index);
                returnFocus();
              }}
            >
              <span className="w-[92px] flex-none font-mono text-xs font-medium text-[var(--text-muted)]">{locationOf(match)}</span>
              <span>
                {match.snippet.pre}
                <mark className="rounded-[2px] bg-[var(--warn-soft)] text-inherit">{match.snippet.hit}</mark>
                {match.snippet.post}
              </span>
            </button>
          ))}
          {count > FIND_LIST_LIMIT ? (
            <div className="px-2.5 py-1.5 text-sm text-[var(--text-muted)]">{count - FIND_LIST_LIMIT} more. Refine your search.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
