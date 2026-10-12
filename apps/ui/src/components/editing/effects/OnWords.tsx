import type { WordFx } from '../../../api/contracts/wordFx';
import { IconButton } from '../../primitives/IconButton';
import { SectionLabel } from '../../primitives/SectionLabel';
import { clock } from '../bar/clock';
import type { CutSpan } from '../model';
import { fxSpan } from '../range/fx/fxCommand';

/** The effects put on words, each with its chain, the words and where they sit, a way to select the words and a way to take the effect off. */
export function OnWords({
  effects,
  cuts,
  onSelect,
  onRemove,
}: {
  effects: readonly WordFx[];
  cuts: readonly CutSpan[];
  onSelect: (fx: WordFx) => void;
  onRemove: (fx: WordFx) => void;
}) {
  if (!effects.length) return null;
  return (
    <section aria-label="Effects on words" className="flex flex-col gap-2">
      <SectionLabel>On words · {effects.length}</SectionLabel>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {effects.map((f) => {
          const at = fxSpan(f, cuts);
          return (
            <li key={f.id} data-wfx={f.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                {f.chainName}
                <br />
                <span className="text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
                  “{f.text}” · {clock(at.start)}–{clock(at.end)}
                  {f.stale ? ' · the words changed' : ''}
                </span>
              </span>
              <IconButton action="locate" label="Select the words" size="sm" disabled={f.stale} onClick={() => onSelect(f)} />
              <IconButton action="remove" label="Remove the effect" variant="danger" size="sm" onClick={() => onRemove(f)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
