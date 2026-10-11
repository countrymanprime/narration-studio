// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { productionPlanSchema } from '../../api/schemas/production';
import { contractValue, PAYMENT_TYPES, paymentOf } from './payment';

describe('payment types', () => {
  it('are the wire names the host merged, read as they are', () => {
    expect(PAYMENT_TYPES.map((t) => t.id)).toEqual(['per_finished_hour', 'royalty_share', 'none']);
    for (const t of PAYMENT_TYPES) {
      expect(productionPlanSchema.safeParse({ deadline: null, contractedAmount: null, payment: t.id, milestones: [] }).success).toBe(true);
    }
  });

  it('reads a plan from a host without the payment type by its amount', () => {
    expect(paymentOf({ contractedAmount: 250 })).toBe('per_finished_hour');
    expect(paymentOf({ contractedAmount: null })).toBe('none');
    expect(paymentOf({ payment: 'royalty_share', contractedAmount: null })).toBe('royalty_share');
  });
});

describe('the value of a contract', () => {
  const plan = (payment: 'per_finished_hour' | 'royalty_share' | 'none', contractedAmount: number | null) => ({
    deadline: null,
    contractedAmount,
    payment,
    milestones: [],
  });
  it('is the rate times the finished hours, and only for a rate per finished hour', () => {
    expect(contractValue(plan('per_finished_hour', 250), 9300 * 2)).toBe(500);
    expect(contractValue(plan('per_finished_hour', null), 9300)).toBeNull();
    expect(contractValue(plan('royalty_share', null), 9300)).toBeNull();
    expect(contractValue(plan('none', null), 9300)).toBeNull();
  });
});
