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
import { useShowEffectInDaw } from './useShowEffectInDaw';

const Fact = ({ name, children }: { name: string; children: ReactNode }) => (
  <div className="flex justify-between gap-2">
    <span className="text-[var(--text-muted)]">{name}</span>
    <span>{children}</span>
  </div>
);

/**
 * One effect: its chain, words, range and share, read from the app's own record, and its settings, Bypass, Preview and Compare through the DAW
 * when the page lends the host (EffectSettings). Without the host, or with a DAW that has no such commands, they are drawn disabled with the
 * DAW's name; Remove works. The header steps to the previous and next effect (`step`, off at either end) and Show in the DAW moves the DAW
 * to the effect's first word.
 */
export function EffectInspector({
  fx,
  cuts,
  total,
  dawName,
  onRemove,
  step,
}: {
  fx: WordFx;
  cuts: readonly CutSpan[];
  total: number;
  dawName: string;
  onRemove: (fx: WordFx) => void;
  /** Picks the effect before (-1) or after (1) this one in the list; `at` and `of` place this one, so the arrows are off at the ends. */
  step?: { at: number; of: number; to: (by: -1 | 1) => void };
}) {
  const show = useShowEffectInDaw(fx);
  const at = fxSpan(fx, cuts);
  const host = useEffectHost();
  return (
    <section aria-label="Effect" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="m-0 flex-1 font-['Barlow_Condensed',sans-serif] text-lg font-semibold">{fx.chainName}</h3>
        <IconButton
          action="previous"
          label="Previous effect"
          size="sm"
          disabledReason={!step || step.at <= 0 ? 'This is the first effect.' : undefined}
          onClick={() => step?.to(-1)}
        />
        <IconButton
          action="next"
          label="Next effect"
          size="sm"
          disabledReason={!step || step.at >= step.of - 1 ? 'This is the last effect.' : undefined}
          onClick={() => step?.to(1)}
        />
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
        <IconButton action="showInReaper" label={`Show in ${dawName}`} size="sm" disabledReason={show.reason ?? undefined} onClick={show.go} />
        <span className="flex-1" />
        <Button variant="danger" size="sm" onClick={() => onRemove(fx)}>
          Remove this effect
        </Button>
      </div>
    </section>
  );
}
