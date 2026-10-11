import { useState } from 'react';
import type { ProductionPayment, ProductionPlan } from '../../api/contracts/production';
import { Panel } from '../primitives/Panel';
import { Select } from '../primitives/Select';
import { TextField } from '../primitives/TextField';
import { num } from './dates';
import { contractValue, PAYMENT_TYPES, paymentOf } from './payment';

export type ContractPanelProps = {
  plan: ProductionPlan;
  /** Words of the narrated chapters, which a rate per finished hour is worth. */
  words: number;
  onPayment: (payment: ProductionPayment) => void;
  /** An amount of zero or more, or null to clear it. */
  onAmount: (amount: number | null) => void;
};

/**
 * How the narrator is paid (the mock's Contract panel). Only a rate per finished hour carries an amount; a royalty share or no payment is a
 * label, and with no rate there is no figure (ADR 0800 decision 2, SNP-Q4).
 */
export function ContractPanel({ plan, words, onPayment, onAmount }: ContractPanelProps) {
  const payment = paymentOf(plan);
  const [typed, setTyped] = useState<string | null>(null);
  const value = contractValue(plan, words);
  const commit = () => {
    if (typed === null) return;
    const text = typed.trim().replace(/,/g, '');
    setTyped(null);
    if (text === '') return onAmount(null);
    const amount = Number(text);
    if (Number.isFinite(amount) && amount >= 0) onAmount(amount);
  };
  return (
    <Panel title="Contract">
      <dl className="flex flex-col gap-2.5 text-[0.88rem]">
        <div className="flex items-center justify-between gap-3">
          <dt>Paid</dt>
          <dd>
            <Select
              label="How you are paid"
              value={payment}
              onChange={(v) => onPayment(v as ProductionPayment)}
              options={PAYMENT_TYPES.map((t) => ({ value: t.id, label: t.label }))}
            />
          </dd>
        </div>
        {payment === 'per_finished_hour' && (
          <div className="flex items-center justify-between gap-3">
            <dt>Amount</dt>
            <dd className="flex items-center gap-2">
              <TextField
                label="Rate per finished hour"
                mono
                inputMode="decimal"
                className="w-[7.5rem]!"
                value={typed ?? (plan.contractedAmount === null ? '' : String(plan.contractedAmount))}
                onChange={setTyped}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              <span className="text-[var(--text-muted)]">per finished hour</span>
            </dd>
          </div>
        )}
        {value !== null && (
          <div className="flex items-center justify-between gap-3">
            <dt>Value at this rate</dt>
            <dd className="font-mono" data-contract-value>
              {num(Math.round(value))}
            </dd>
          </div>
        )}
      </dl>
    </Panel>
  );
}
