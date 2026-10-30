import { useState } from 'react';
import type { ProductionPayment, ProductionPlan } from '../../api/contracts/production';
import { Panel } from '../primitives/Panel';
import { Select } from '../primitives/Select';
import { TextField } from '../primitives/TextField';
import { num } from './dates';
import { contractValue, isTooLarge, MAX_AMOUNT, parseAmount, PAYMENT_TYPES, paymentOf, plainNumber } from './payment';

export type ContractPanelProps = {
  plan: ProductionPlan;
  /** Words of the narrated chapters, which a rate per finished hour is worth. */
  words: number;
  /** Words per finished hour of the schedule's basis (`useEffectiveWph`); the standard when absent. */
  wph?: number;
  onPayment: (payment: ProductionPayment) => void;
  /** An amount of zero or more, or null to clear it. */
  onAmount: (amount: number | null) => void;
  /** Called with the sentence when the typed amount is not a number of zero or more; nothing is sent. */
  onRefuse: (sentence: string) => void;
  /** Called when what was typed is a good amount (or empty), written or already stored: an earlier refusal is no longer true. */
  onAccepted?: () => void;
};

/**
 * How the narrator is paid (the mock's Contract panel). Only a rate per finished hour carries an amount; a royalty share or no payment is a
 * label, and with no rate there is no figure (src/studio/desktop/internal/project/manifest.go, SNP-Q4).
 */
export function ContractPanel({ plan, words, wph, onPayment, onAmount, onRefuse, onAccepted }: ContractPanelProps) {
  const payment = paymentOf(plan);
  const [typed, setTyped] = useState<string | null>(null);
  const value = contractValue(plan, words, wph);
  const commit = () => {
    if (typed === null) return;
    const text = typed.trim();
    setTyped(null);
    if (text === '') {
      onAccepted?.();
      return onAmount(null);
    }
    const amount = parseAmount(text);
    if (amount === null)
      return onRefuse(
        isTooLarge(text)
          ? `That rate is too large. Write it as ${MAX_AMOUNT.toLocaleString('en-US')} or less.`
          : text.includes(',') && !text.includes('.')
            ? `${text} could mean 1.5 or 15. Write a decimal with a point, and use commas only for thousands, such as 1,250.50.`
            : 'Write the rate as a number of zero or more, such as 250 or 1,250.50.',
      );
    onAccepted?.();
    if (amount !== plan.contractedAmount) onAmount(amount);
  };
  return (
    <Panel title="Contract">
      {/* One label column and one control column (XSH-1): the select and the rate box start at the same x and are the same width. */}
      <dl className="grid grid-cols-[7rem_minmax(0,18rem)] items-center gap-x-4 gap-y-2.5 text-[0.88rem]">
        <dt>Paid</dt>
        <dd>
          <Select
            label="How you are paid"
            value={payment}
            onChange={(v) => onPayment(v as ProductionPayment)}
            options={PAYMENT_TYPES.map((t) => ({ value: t.id, label: t.label }))}
            fullWidth
          />
        </dd>
        {payment === 'per_finished_hour' && (
          <>
            <dt>Amount</dt>
            {/* The select above already says "Per finished hour", so the box carries no unit of its own; its name keeps it for a screen reader. */}
            <dd>
              <TextField
                label="Rate per finished hour"
                mono
                inputMode="decimal"
                value={typed ?? (plan.contractedAmount === null ? '' : plainNumber(plan.contractedAmount))}
                onChange={setTyped}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
            </dd>
          </>
        )}
        {value !== null && (
          <>
            <dt>Value at this rate</dt>
            <dd className="font-mono" data-contract-value>
              {num(Math.round(value))}
            </dd>
          </>
        )}
      </dl>
    </Panel>
  );
}
