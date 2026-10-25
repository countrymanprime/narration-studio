import type { DeliveryRule } from '../../../types';
import { SectionLabel } from '../../primitives/SectionLabel';
import { EDIT_ROW, LimitRow, RULE_ROW } from './LimitRow';
import { limitText } from './limitText';

/**
 * The "Files" rows: the file format, sample rate, channels and the longest file. The host fixes the first three (a custom copy can only turn
 * them off), so they are text in every profile; the longest file has a highest and is edited like a limit in a custom one.
 */
export function FormatRows({
  rules,
  readOnly,
  onEdit,
  onDeclined,
}: {
  rules: DeliveryRule[];
  readOnly: boolean;
  onEdit: (id: string, side: 'min' | 'max', value: number) => void;
  onDeclined?: (rule: DeliveryRule) => void;
}) {
  if (rules.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Files</SectionLabel>
      {rules.map((rule) =>
        rule.oneOf.length > 0 || (rule.min === null && rule.max === null) || rule.boundText ? (
          <div key={rule.id} className={`${RULE_ROW} ${readOnly ? '' : EDIT_ROW}`}>
            <span>{rule.label}</span>
            <span className="font-mono [overflow-wrap:anywhere]">{limitText(rule)}</span>
          </div>
        ) : (
          <LimitRow key={rule.id} rule={rule} readOnly={readOnly} onEdit={(side, value) => onEdit(rule.id, side, value)} onDeclined={onDeclined} />
        ),
      )}
    </div>
  );
}
