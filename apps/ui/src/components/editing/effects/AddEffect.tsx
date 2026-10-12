import type { FxList } from '../../../ports/daw';
import { Button } from '../../primitives/Button';
import { SectionLabel } from '../../primitives/SectionLabel';
import { fmtPct, type Impact } from './effectsMath';

export const SELECT_FIRST = 'Select the words first.';

/**
 * Add an effect to the selected words. With no selection the button is off and says so; a DAW that cannot add one puts its own reason beside
 * it. Over the cap it warns before anything is asked, and the button reads "Add anyway". The DAW's own chains are listed under their source.
 */
export function AddEffect({
  hasSelection,
  reason,
  impact,
  cap,
  list,
  onAdd,
}: {
  hasSelection: boolean;
  /** Why the DAW cannot add one to this selection, or ''. */
  reason: string;
  /** What the selection does to the coverage; null with no usable selection. */
  impact: Impact | null;
  cap: number;
  list: FxList | null;
  onAdd: () => void;
}) {
  const note = !hasSelection ? SELECT_FIRST : reason;
  const over = !!impact?.over;
  return (
    <section aria-label="Add an effect" className="flex flex-col gap-2">
      <SectionLabel>Add an effect</SectionLabel>
      {impact && !note ? (
        <p className="m-0 text-[length:var(--font-size-sm)]" data-impact>
          Coverage {fmtPct(impact.before)} → <b>{fmtPct(impact.after)}</b>
        </p>
      ) : null}
      {over && impact && !note ? (
        <p
          role="alert"
          className={`m-0 rounded-[var(--radius-button)] p-2 text-[length:var(--font-size-sm)] ${impact.far ? 'bg-[var(--danger-soft)] text-[var(--danger-text)]' : 'bg-[var(--warning-soft)]'}`}
        >
          This takes coverage from <b>{fmtPct(impact.before)}</b> to <b>{fmtPct(impact.after)}</b>, over the {fmtPct(cap)} cap.
          {impact.far ? ' That is more than twice the cap.' : ''}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button disabled={!!note} aria-describedby={note ? 'addfx-note' : undefined} onClick={onAdd}>
          {over ? 'Add anyway' : 'Add effect'}
        </Button>
      </div>
      {note ? (
        <p id="addfx-note" className="m-0 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
          {note}
        </p>
      ) : null}
      {list ? (
        <div className="flex flex-col gap-1" aria-label={list.source} role="group">
          <span className="text-[length:var(--font-size-sm)] text-[var(--text-muted)]">{list.source}</span>
          <ul className="m-0 list-none p-0 text-[length:var(--font-size-sm)]">
            {list.choices.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
