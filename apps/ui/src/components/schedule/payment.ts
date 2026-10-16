import type { ProductionPayment, ProductionPlan } from '../../api/contracts/production';
import { WPH } from './estimates';

/** How the narrator can be paid. The ids are the host's wire names (ADR 0800), read as they are and never mapped. */
export const PAYMENT_TYPES: readonly { id: ProductionPayment; label: string }[] = [
  { id: 'per_finished_hour', label: 'Per finished hour' },
  { id: 'royalty_share', label: 'Royalty share' },
  { id: 'none', label: 'None or unspecified' },
];

/** Payment a plan from a host older than the payment type reads as: a contracted amount means per finished hour. */
export const paymentOf = (plan: { payment?: ProductionPayment; contractedAmount: number | null }): ProductionPayment =>
  plan.payment ?? (plan.contractedAmount === null ? 'none' : 'per_finished_hour');

/** What a contracted amount is worth: the rate times the finished hours. There is no value without a per-finished-hour rate. */
export const contractValue = (plan: ProductionPlan, words: number): number | null =>
  paymentOf(plan) === 'per_finished_hour' && plan.contractedAmount !== null ? plan.contractedAmount * (words / WPH) : null;

/**
 * An amount as typed: digits with an optional decimal part, thousands commas only in groups of three ("1,250.50"). Anything else is null:
 * "1,5" must not become 15, and "1e3", "0x10", "Infinity", a minus sign, other scripts' digits and emoji are not amounts.
 */
export function parseAmount(text: string): number | null {
  const t = text.trim();
  if (!/^(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$/.test(t)) return null;
  const amount = Number(t.replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

/** An amount as plain digits for a field: never "1e+21". */
export const plainNumber = (amount: number): string => amount.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
