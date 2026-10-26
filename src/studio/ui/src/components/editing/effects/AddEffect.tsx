import type { FxList } from '../../../ports/daw';
import { Button } from '../../primitives/Button';
import { SectionLabel } from '../../primitives/SectionLabel';
import { fmtPct, type Impact } from './effectsMath';
import type { FxFavourites } from './useFxFavourites';
import type { ChooseState } from '../range/fx/useChooseInDaw';
import { ChooseInDaw } from './ChooseInDaw';

/** Choose in the DAW as Add an effect offers it: the button's DAW, why it is off for these words ('' when on), where it is, and its steps. */
export interface AddEffectChoose {
  dawName: string;
  reason: string;
  state: ChooseState;
  onChoose: () => void;
  onKeep: () => void;
  onCancel: () => void;
  onCheck: () => void;
}

export const SELECT_FIRST = 'Select the words first.';

/**
 * Add an effect to the selected words. With no selection the button is off and says so; a DAW that cannot add one puts its own reason beside
 * it. Over the cap it warns before anything is asked, and the button reads "Add anyway". The DAW's own chains are listed under their source.
 * With a DAW that has an FX window of its own, Choose in the DAW opens it for the words so any plug-in the DAW has can go on them (#2251).
 */
export function AddEffect({
  hasSelection,
  reason,
  impact,
  cap,
  list,
  favourites,
  onAdd,
  choose,
}: {
  hasSelection: boolean;
  /** Why the DAW cannot add one to this selection, or ''. */
  reason: string;
  /** What the selection does to the coverage; null with no usable selection. */
  impact: Impact | null;
  cap: number;
  list: FxList | null;
  /** The narrator's favourites, when the page has them: each listed chain gets a star and the list is already in favourites-first order. */
  favourites?: FxFavourites;
  onAdd: () => void;
  /** Choose in the DAW (#2251), for a DAW with an FX window of its own; absent for any other. */
  choose?: AddEffectChoose;
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
          className={`m-0 rounded-[var(--radius-button)] p-2 text-[length:var(--font-size-sm)] ${impact.far ? 'bg-[var(--danger-soft)] text-[var(--danger-text)]' : 'bg-[var(--warn-soft)]'}`}
        >
          This takes coverage from <b>{fmtPct(impact.before)}</b> to <b>{fmtPct(impact.after)}</b>, over the {fmtPct(cap)} cap.
          {impact.far ? ' That is more than twice the cap.' : ''}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button disabled={!!note} aria-describedby={note ? 'addfx-note' : undefined} onClick={onAdd}>
          {over ? 'Add anyway' : 'Add effect'}
        </Button>
        {choose ? (
          <Button
            variant="secondary"
            disabled={!hasSelection || !!choose.reason || choose.state.phase !== 'idle'}
            aria-describedby={!hasSelection ? 'addfx-note' : choose.reason ? 'choosefx-note' : undefined}
            onClick={choose.onChoose}
          >
            {choose.state.phase === 'opening' ? `Opening ${choose.dawName}…` : `Choose in ${choose.dawName}…`}
          </Button>
        ) : null}
      </div>
      {choose && hasSelection && choose.reason && choose.reason !== note ? (
        <p id="choosefx-note" className="m-0 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
          {choose.reason}
        </p>
      ) : null}
      {choose?.state.phase === 'choosing' ? (
        <ChooseInDaw state={choose.state} dawName={choose.dawName} onKeep={choose.onKeep} onCancel={choose.onCancel} onCheck={choose.onCheck} />
      ) : null}
      {note ? (
        <p id="addfx-note" className="m-0 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
          {note}
        </p>
      ) : null}
      {list ? (
        <div className="flex flex-col gap-2" aria-label={list.source} role="group">
          {/* A section label like Add an effect's, not a muted line that read as the note above's second line (alignment audit R3ED-18). */}
          <SectionLabel>{list.source}</SectionLabel>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[length:var(--font-size-sm)]">
            {list.choices.map((c) => {
              const starred = favourites?.names.some((n) => n.toLowerCase() === c.name.toLowerCase()) ?? false;
              return (
                // The chain's name, then its action at the right, 8 px from the next row (XED-16).
                <li key={c.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{c.name}</span>
                  {favourites ? (
                    <Button variant="secondary" size="sm" aria-label={`Favourite ${c.name}`} aria-pressed={starred} onClick={() => favourites.toggle(c.name)}>
                      {starred ? '★ Favourite' : 'Favourite'}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {favourites ? <p className="m-0 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">Favourites apply to every project.</p> : null}
          {favourites?.error ? (
            <p role="alert" className="m-0 text-[length:var(--font-size-sm)] text-[var(--danger-text)]">
              {favourites.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
