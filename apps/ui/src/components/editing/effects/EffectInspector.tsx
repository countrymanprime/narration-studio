import type { ReactNode } from 'react';
import type { WordFx } from '../../../api/contracts/wordFx';
import { Button } from '../../primitives/Button';
import { Checkbox } from '../../primitives/Checkbox';
import { SectionLabel } from '../../primitives/SectionLabel';
import { clock } from '../bar/clock';
import type { CutSpan } from '../model';
import { fxSpan } from '../range/fx/fxCommand';
import { fmtPct, shareOf } from './effectsMath';

const Fact = ({ name, children }: { name: string; children: ReactNode }) => (
  <div className="flex justify-between gap-2">
    <span className="text-[var(--text-muted)]">{name}</span>
    <span>{children}</span>
  </div>
);

/** A control the DAW has no command for: it stays, disabled, and says why. */
const Off = ({ id, dawName, children }: { id: string; dawName: string; children: ReactNode }) => (
  <div className="flex items-center gap-2">
    {children}
    <span id={id} className="text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
      Not available in {dawName}.
    </span>
  </div>
);

/**
 * One effect: its chain, words, range and share, read from the app's own record. The DAW has no command for an effect's settings, bypass,
 * preview or compare, so they are drawn disabled with the DAW's name; Remove works.
 */
export function EffectInspector({
  fx,
  cuts,
  total,
  dawName,
  onRemove,
}: {
  fx: WordFx;
  cuts: readonly CutSpan[];
  total: number;
  dawName: string;
  onRemove: (fx: WordFx) => void;
}) {
  const at = fxSpan(fx, cuts);
  return (
    <section aria-label="Effect" className="flex flex-col gap-3">
      <h3 className="m-0 font-['Barlow_Condensed',sans-serif] text-lg font-semibold">{fx.chainName}</h3>
      <div className="flex flex-col gap-1 text-sm">
        <Fact name="Chain">{fx.chainName}</Fact>
        <Fact name="Words">“{fx.text}”</Fact>
        <Fact name="Time">
          {clock(at.start)}–{clock(at.end)}
        </Fact>
        <Fact name="Covers">{fx.stale ? 'nothing: the words changed' : `${fmtPct(shareOf(fx, cuts, total))} of this chapter`}</Fact>
        <Fact name="From">{fx.source}</Fact>
      </div>
      <SectionLabel>Settings</SectionLabel>
      <Off id="fx-off-settings" dawName={dawName}>
        <Button variant="secondary" size="sm" disabled aria-describedby="fx-off-settings">
          Settings
        </Button>
      </Off>
      <Off id="fx-off-bypass" dawName={dawName}>
        <Checkbox checked={false} disabled onChange={() => {}}>
          Bypass this effect
        </Checkbox>
      </Off>
      <Off id="fx-off-preview" dawName={dawName}>
        <Button variant="secondary" size="sm" disabled aria-describedby="fx-off-preview">
          Preview
        </Button>
        <Button variant="secondary" size="sm" disabled aria-describedby="fx-off-preview">
          Compare
        </Button>
      </Off>
      <div className="flex items-center gap-2">
        <span className="flex-1" />
        <Button variant="danger" size="sm" onClick={() => onRemove(fx)}>
          Remove this effect
        </Button>
      </div>
    </section>
  );
}
