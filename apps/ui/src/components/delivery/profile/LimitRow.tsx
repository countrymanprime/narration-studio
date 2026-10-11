import type { DeliveryRule } from '../../../types';
import { CommitBox } from './CommitBox';
import { fromShown, limitText, shownUnit, toShown } from './limitText';

const MUTED = { color: 'var(--text-muted)' };

/**
 * One check on every chapter: the rule's name and its limit. A built-in's limit is read-only text; a custom profile's is a lowest and
 * a highest box (or "no lowest" / "no highest" where the rule has one bound) with the unit. A box takes a number; anything else is ignored.
 */
export function LimitRow({ rule, readOnly, onEdit }: { rule: DeliveryRule; readOnly: boolean; onEdit: (side: 'min' | 'max', value: number) => void }) {
  const box = (side: 'min' | 'max') => {
    const bound = rule[side];
    const word = side === 'min' ? 'lowest' : 'highest';
    if (bound === null) return <span style={MUTED}>{`no ${word}`}</span>;
    return (
      <CommitBox
        label={`${rule.label} ${word}`}
        value={toShown(rule, bound)}
        mono
        className="w-24!"
        onCommit={(text) => {
          const value = fromShown(rule, text);
          if (value !== undefined) onEdit(side, value);
        }}
      />
    );
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>{rule.label}</span>
      {readOnly || rule.off ? (
        <span className="font-mono">{limitText(rule)}</span>
      ) : (
        <span className="flex items-center gap-2">
          {box('min')}
          <span style={MUTED}>to</span>
          {box('max')}
          <span style={MUTED}>{shownUnit(rule)}</span>
        </span>
      )}
    </div>
  );
}
