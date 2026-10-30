import type { DeliveryRule } from '../../../types';
import { CommitBox } from './CommitBox';
import { fromShown, limitText, shownUnit, toShown } from './limitText';

const MUTED = { color: 'var(--text-muted)' };

/**
 * The profile card's label-and-value row: a label column (7 to 12 rem) and the value left-aligned after it, at least a field's height,
 * so a value sits beside its label rather than 700 px away at the card's far edge (alignment audit XDL-3). In a card narrower than
 * 24 rem (390 px) the label stacks over its value, so the value keeps the card's width instead of wrapping a word a line (#2642). `FormatRows` draws its text rows with it too.
 */
export const RULE_ROW = 'grid grid-cols-1 @sm:grid-cols-[minmax(7rem,12rem)_minmax(0,1fr)] items-center gap-x-4 gap-y-1 text-sm';
/** A custom profile's rows are a field's height whether they hold boxes, "Off" or text, so they share one pitch (XDL-1). */
export const EDIT_ROW = 'min-h-9';
/**
 * A custom profile's limit: lowest, "to", highest and the unit in fixed columns, so every row's boxes start and end at one x whatever
 * its unit or a missing bound (XDL-1).
 */
const BOXES = 'grid grid-cols-[6rem_auto_6rem_3rem] items-center justify-start gap-2';

/**
 * One check on every chapter: the rule's name and its limit. A built-in's limit is read-only text; a custom profile's is a lowest and
 * a highest box (or "no lowest" / "no highest" where the rule has one bound) with the unit. A box takes a number; anything else is ignored.
 */
export function LimitRow({
  rule,
  readOnly,
  onEdit,
  onDeclined,
}: {
  rule: DeliveryRule;
  readOnly: boolean;
  onEdit: (side: 'min' | 'max', value: number) => void;
  /** The text typed is not a number: the box goes back to what it was. */
  onDeclined?: (rule: DeliveryRule) => void;
}) {
  const box = (side: 'min' | 'max') => {
    const bound = rule[side];
    const word = side === 'min' ? 'lowest' : 'highest';
    if (bound === null) return <span className="text-right" style={MUTED}>{`no ${word}`}</span>;
    return (
      <CommitBox
        label={`${rule.label} ${word}`}
        value={toShown(rule, bound)}
        mono
        inputMode="decimal"
        className="w-full!"
        onCommit={(text) => {
          const value = fromShown(rule, text);
          if (value === undefined) onDeclined?.(rule);
          else onEdit(side, value);
        }}
      />
    );
  };
  return (
    <div className={`${RULE_ROW} ${readOnly ? '' : EDIT_ROW}`}>
      <span>{rule.label}</span>
      {readOnly || rule.off ? (
        <span className="font-mono [overflow-wrap:anywhere]">{limitText(rule)}</span>
      ) : (
        <span className={BOXES}>
          {box('min')}
          <span style={MUTED}>to</span>
          {box('max')}
          <span style={MUTED}>{shownUnit(rule)}</span>
        </span>
      )}
    </div>
  );
}
