import { Panel } from '../primitives/Panel';
import { fmtD, hm, num } from './dates';
import { PACE, RATIO, WPH } from './estimates';
import type { Calc } from './progress';

/** "How this is worked out" (the mock's panel): the work left by stage at the fixed inputs, and when it is done at the daily pace. */
export function WorkedOut({ k }: { k: Calc }) {
  const rows: [string, string][] = [
    ['Recording left', hm(k.recLeft)],
    ['Editing left', hm(k.editLeft)],
    ['Proofing left', hm(k.proofLeft)],
    ['Pickups', hm(k.pickH)],
  ];
  return (
    <Panel title="How this is worked out">
      <dl className="flex flex-col gap-2 text-[0.88rem]">
        {rows.map(([name, value]) => (
          <div key={name} className="flex justify-between gap-3">
            <dt>{name}</dt>
            <dd className="font-mono">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t border-[var(--border)] pt-2 font-semibold">
          <dt>Work left</dt>
          <dd className="font-mono">{hm(k.remain)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Your pace</dt>
          <dd className="font-mono">{PACE.toFixed(1)} h/day</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Pace needed for the due date</dt>
          <dd className="font-mono">{Number.isFinite(k.reqPace) ? `${k.reqPace.toFixed(1)} h/day` : '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>At your pace, done</dt>
          <dd className="font-semibold">{fmtD(k.finish)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[0.8125rem] text-[var(--text-muted)]">
        Finished audio is words ÷ {num(WPH)}. Recording takes {RATIO.rec}×, editing {RATIO.edit}× and proofing {RATIO.proof}× the finished hours.
      </p>
    </Panel>
  );
}
