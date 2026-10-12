import { useEffect, useMemo, useState } from 'react';
import type { FxChoice, FxList } from '../../../../ports/daw';
import { Button } from '../../../primitives/Button';
import { Select } from '../../../primitives/Select';
import { SectionLabel } from '../../../primitives/SectionLabel';
import { clock } from '../../bar/clock';
import { summarize, type ChapterDoc, type CutSpan, type SelSummary } from '../../model';
import { snapText, type RangeLocator, type SnappedEnd } from '../common/locate';
import type { RangePlan } from '../common/rangePlan';
import { FxPieces } from './FxPieces';
import { FX_JOINS, fxButton, fxPlanText } from './fxText';
import type { FxOver } from './fxCommand';

type Acting = Exclude<RangePlan, { kind: 'refused' }>;

const sec = (n: number): string => `${n.toFixed(1)} s`;

export interface FxDialogProps {
  doc: ChapterDoc;
  keys: readonly string[];
  cuts: readonly CutSpan[];
  plan: Acting;
  list: FxList;
  /** The chain the narrator picked in the menu; the first of the list when none. */
  chainId?: string;
  chapterName: string;
  locator: RangeLocator;
  /** Moves one end (seconds now) to a zero crossing through the alignment port. */
  snap: (at: number) => Promise<SnappedEnd>;
  /** What the snapped range comes to for "Add anyway": an overlap or the Effects tab's cap, or null. */
  overOf: (summary: SelSummary) => FxOver | null;
  onCancel: () => void;
  onConfirm: (summary: SelSummary, chain: FxChoice, over: FxOver | null) => void;
}

/**
 * The question asked before an effect goes on words (the mock's `FxDialog`). Choosing a chain opens this and applies nothing: it shows the
 * words, the split ends (snapped to zero crossings), the pieces either side, the chain (which can be changed here) and what the DAW does and how
 * it is undone. Cancel has the focus and changes nothing.
 */
export function FxDialog({ doc, keys, cuts, plan, list, chainId, chapterName, locator, snap, overOf, onCancel, onConfirm }: FxDialogProps) {
  const [chain, setChain] = useState(chainId ?? list.choices[0]?.id ?? '');
  const choice = list.choices.find((c) => c.id === chain);
  const [snapped, setSnapped] = useState<Map<number, SnappedEnd> | null>(null);
  const asked = useMemo(() => summarize(doc, [...keys], cuts, (t) => t), [doc, keys, cuts]);
  useEffect(() => {
    let live = true;
    const ends = [...new Set(asked.ranges.flatMap((r) => [r.start, r.end]))];
    void Promise.all(ends.map(async (t) => [t, await snap(t)] as const)).then((pairs) => live && setSnapped(new Map(pairs)));
    return () => {
      live = false;
    };
  }, [asked, snap]);
  const sum = useMemo(() => (snapped ? summarize(doc, [...keys], cuts, (t) => snapped.get(t)?.time ?? t) : asked), [doc, keys, cuts, snapped, asked]);
  const r = sum.ranges[0];
  const first = asked.ranges[0];
  const ends = snapped && first ? snapText(snapped.get(first.start) ?? { time: 0, moved: 0 }, snapped.get(first.end) ?? { time: 0, moved: 0 }) : '';
  const over = useMemo(() => (snapped ? overOf(sum) : null), [snapped, overOf, sum]);
  const n = sum.audible.length;
  const facts = 'm-0 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5';
  return (
    <div className="flex flex-col gap-3" data-fx-dialog>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <SectionLabel>Words</SectionLabel>
        <div className="inline-block max-w-full rounded bg-[var(--info-soft)] px-2 py-0.5 font-serif text-lg" data-fx-words>
          {sum.words}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SectionLabel>{list.source}</SectionLabel>
        <Select label="Effect" className="max-w-full" value={chain} onChange={setChain} options={list.choices.map((c) => ({ value: c.id, label: c.name }))} />
      </div>
      {r && choice ? <FxPieces items={doc.items.filter((i) => i.pid === r.pid)} keys={r.keys} start={r.start} end={r.end} chain={choice.name} /> : null}
      <dl className={facts}>
        <dt className="pt-0.5">
          <SectionLabel>Splits at</SectionLabel>
        </dt>
        <dd className="m-0 font-mono" data-fx-split-at>
          {r ? `${clock(r.start)} and ${clock(r.end)} · ${sec(r.end - r.start)} in the middle` : '—'}
        </dd>
        {ends ? (
          <>
            <dt className="pt-0.5">
              <SectionLabel>Ends</SectionLabel>
            </dt>
            <dd className="m-0" data-fx-snap>
              {ends}
            </dd>
          </>
        ) : null}
        <dt className="pt-0.5">
          <SectionLabel>In</SectionLabel>
        </dt>
        <dd className="m-0" data-fx-in>
          {chapterName}
          {r ? ` · ${r.takeId ? `take ${r.takeId} · ` : ''}${locator.place(r)}` : ''}
        </dd>
        <dt className="pt-0.5">
          <SectionLabel>{plan.kind === 'backup-then-daw' ? 'Applies' : 'Adds'}</SectionLabel>
        </dt>
        <dd className="m-0" data-fx-chain>
          {choice ? `${choice.name} · from “${list.source}”` : '—'}
        </dd>
        <dt className="pt-0.5">
          <SectionLabel>Joins</SectionLabel>
        </dt>
        <dd className="m-0">{FX_JOINS}</dd>
      </dl>
      {over ? (
        <p className="m-0 rounded-lg bg-[var(--warn-soft)] px-3 py-2.5 text-sm" role="alert" data-fx-over>
          {over.text}
        </p>
      ) : null}
      <p className="m-0 rounded-lg bg-[var(--info-soft)] px-3 py-2.5 text-sm" data-fx-plan>
        {fxPlanText(plan)}
      </p>
      {/* The footer stays in view, so Cancel taking the focus never scrolls the question away. */}
      <div className="sticky bottom-[-1.1rem] mx-[-1.1rem] mb-[-1.1rem] flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-[1.1rem] py-3">
        <Button type="button" variant="secondary" autoFocus onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="primary" disabled={!snapped || !r || !choice || n === 0} onClick={() => choice && onConfirm(sum, choice, over)}>
          {fxButton(over !== null, plan)}
        </Button>
      </div>
    </div>
  );
}
