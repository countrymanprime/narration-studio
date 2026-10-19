import type { ReactNode } from 'react';
import type { WordFx } from '../../../api/contracts/wordFx';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { SectionLabel } from '../../primitives/SectionLabel';
import { clock } from '../bar/clock';
import type { CutSpan } from '../model';
import { fxSpan } from '../range/fx/fxCommand';
import { EffectSettings, OffControls, useEffectHost } from './EffectSettings';
import { fmtPct, shareOf } from './effectsMath';
import { ShowEffectInDaw } from './ShowEffectInDaw';

const Fact = ({ name, children }: { name: string; children: ReactNode }) => (
  <div className="flex justify-between gap-2">
    <span className="text-[var(--text-muted)]">{name}</span>
    <span>{children}</span>
  </div>
);

/**
 * One effect: its chain, words, range and share, read from the app's own record, and its settings, Bypass, Preview and Compare through the DAW
 * when the page lends the host (EffectSettings). Without the host, or with a DAW that has no such commands, they are drawn disabled with the
 * DAW's name; Remove works.
 */
export function EffectInspector({
  fx,
  cuts,
  total,
  dawName,
  onRemove,
  position,
  onStep,
}: {
  fx: WordFx;
  cuts: readonly CutSpan[];
  total: number;
  dawName: string;
  onRemove: (fx: WordFx) => void;
  /** Where this effect sits among the chapter's, for the Previous and Next arrows (the mock's `#prevf`, `#nextf`). Without it the arrows are not drawn. */
  position?: { index: number; count: number };
  /** Picks the effect before (-1) or after (+1) this one. */
  onStep?: (by: -1 | 1) => void;
}) {
  const at = fxSpan(fx, cuts);
  const host = useEffectHost();
  return (
    <section aria-label="Effect" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="m-0 flex-1 font-['Barlow_Condensed',sans-serif] text-lg font-semibold">{fx.chainName}</h3>
        {position && onStep ? (
          <>
            <IconButton
              action="previous"
              label="Previous effect"
              size="sm"
              disabledReason={position.index <= 0 ? 'This is the first effect.' : undefined}
              onClick={() => onStep(-1)}
            />
            <IconButton
              action="next"
              label="Next effect"
              size="sm"
              disabledReason={position.index >= position.count - 1 ? 'This is the last effect.' : undefined}
              onClick={() => onStep(1)}
            />
          </>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <Fact name="Chain">{fx.chainName}</Fact>
        <Fact name="Words">“{fx.text}”</Fact>
        <Fact name="Time">
          {clock(at.start)}–{clock(at.end)}
        </Fact>
        <Fact name="Covers">{fx.stale ? 'nothing: the words changed' : `${fmtPct(shareOf(fx, cuts, total))} of this chapter`}</Fact>
        <Fact name="From">{fx.source}</Fact>
      </div>
      {host ? (
        <EffectSettings fx={fx} cuts={cuts} total={total} dawName={dawName} host={host} />
      ) : (
        <>
          <SectionLabel>Settings</SectionLabel>
          <OffControls dawName={dawName} />
        </>
      )}
      <div className="flex items-center gap-2">
        <ShowEffectInDaw fx={fx} />
        <span className="flex-1" />
        <Button variant="danger" size="sm" onClick={() => onRemove(fx)}>
          Remove this effect
        </Button>
      </div>
    </section>
  );
}
