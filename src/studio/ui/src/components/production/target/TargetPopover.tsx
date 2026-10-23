import type { ProductionRateBasis } from '../../../api/contracts/production';
import type { Measured } from '../../../api/schemas/base';
import { hm, num } from '../../schedule/dates';
import { WPH } from '../../schedule/estimates';
import { ToggleGroup } from '../../primitives/ToggleGroup';
import { formatLength } from '../productionFormat';
import type { OwnRate } from './pace.selectors';

const DASH = '—';

/** "A, B and C": the chapter tags the own rate was worked out from. */
const joinTags = (tags: readonly string[]): string => (tags.length > 1 ? `${tags.slice(0, -1).join(', ')} and ${tags[tags.length - 1]}` : tags.join(''));

function Cell({ name, rate, target, on }: { name: string; rate: string; target: string; on: boolean }) {
  return (
    <div
      data-basis={name.toLowerCase()}
      className={`flex flex-col gap-0.5 rounded-[var(--radius-button)] border p-2 ${on ? 'border-[var(--accent)] bg-[var(--bg)]' : 'border-[var(--line-strong)]'}`}
    >
      <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">{name}</span>
      <span className="font-mono">
        <b>{rate}</b> <small>w/h</small>
      </span>
      <span className="text-xs text-[var(--text-muted)]">
        Target <b className="font-mono text-[var(--text)]">{target}</b>
      </span>
    </div>
  );
}

/**
 * What the finished-hour target is made of (the mock's `TargetPopover`): the standard rate and the narrator's own measured rate, the
 * target both ways, how the own rate was worked out, and which one the schedule uses. "Your pace" is offered only once measured.
 */
export function TargetPopover({
  own,
  hours,
  basis,
  onBasis,
}: {
  own: Measured<OwnRate>;
  hours: { standard: number; own: number | null };
  basis: ProductionRateBasis;
  onBasis: (basis: ProductionRateBasis) => void;
}) {
  const options = [{ value: 'standard', label: 'Standard' }, ...(own.ok ? [{ value: 'own', label: 'Your pace' }] : [])];
  return (
    <div className="flex w-80 max-w-full flex-col gap-2.5">
      <div className="text-xs font-semibold text-[var(--text-muted)] uppercase">Finished-hour target</div>
      <div className="grid grid-cols-2 gap-2">
        <Cell name="Standard" rate={num(WPH)} target={hm(hours.standard)} on={basis === 'standard'} />
        <Cell name="Yours" rate={own.ok ? num(own.value.wph) : DASH} target={hours.own === null ? DASH : hm(hours.own)} on={basis === 'own'} />
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        {own.ok
          ? `${joinTags(own.value.chapters.map((c) => c.tag))} ${own.value.chapters.length === 1 ? 'has' : 'have'} a measured length: ${num(own.value.words)} words in ${formatLength(own.value.seconds)}.`
          : `Your rate is not measured yet. ${own.reason}`}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">Schedule basis</span>
        <ToggleGroup
          label="Schedule basis"
          look="segmented"
          value={basis}
          options={options}
          onChange={(value) => onBasis(value === 'own' ? 'own' : 'standard')}
        />
      </div>
    </div>
  );
}
