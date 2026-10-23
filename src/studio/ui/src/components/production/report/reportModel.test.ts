import { describe, expect, it } from 'vitest';
import { amountOffered, reportPath } from './reportModel';

describe('amountOffered', () => {
  it('only a per-hour plan with an amount offers it', () => {
    expect(amountOffered({ payment: 'per_finished_hour', contractedAmount: 250 })).toBe(true);
    expect(amountOffered({ contractedAmount: 250 })).toBe(true);
    expect(amountOffered({ payment: 'per_finished_hour', contractedAmount: null })).toBe(false);
    expect(amountOffered({ payment: 'royalty_share', contractedAmount: null })).toBe(false);
    expect(amountOffered({ payment: 'none', contractedAmount: 250 })).toBe(false);
    expect(amountOffered(undefined)).toBe(false);
  });
});

describe('reportPath', () => {
  it('keeps the folder’s own separators', () => {
    expect(reportPath('narration-utils/production/reports', 'status-1', 'html')).toBe('narration-utils/production/reports/status-1.html');
    expect(reportPath('C:\\Books\\Dune\\reports', 'status-1', 'json')).toBe('C:\\Books\\Dune\\reports\\status-1.json');
    expect(reportPath('reports/', 'status-1', 'json')).toBe('reports/status-1.json');
  });
});
