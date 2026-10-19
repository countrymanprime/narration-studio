import type { ProductionPlan, ProductionReportInclude } from '../../../api/contracts/production';

export type ReportFormat = 'html' | 'json';

/**
 * The contracted amount is offered only when the plan pays per finished hour and an amount is set: royalty share and none carry no
 * figure (SNP-Q4). A plan saved before the payment type was recorded only ever paid per hour, so an absent type counts.
 */
export function amountOffered(plan: Pick<ProductionPlan, 'payment' | 'contractedAmount'> | undefined): boolean {
  if (!plan || plan.contractedAmount === null) return false;
  return plan.payment === undefined || plan.payment === 'per_finished_hour';
}

/** Where an export would write the chosen format: the host's folder and stem joined with the folder's own separator. */
export function reportPath(folder: string, stem: string, format: ReportFormat): string {
  const separator = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  const joined = /[\\/]$/.test(folder) ? folder : `${folder}${separator}`;
  return `${joined}${stem}.${format}`;
}

export type ReportSection = keyof ProductionReportInclude;

/** The report's sections in the order the form lists them; `money` is the one only a per-finished-hour plan with an amount offers. */
export const REPORT_SECTIONS: ReadonlyArray<{ id: ReportSection; label: string }> = [
  { id: 'words', label: 'Words and finished audio' },
  { id: 'stages', label: 'Hours by stage' },
  { id: 'milestones', label: 'Deadline and milestones' },
  { id: 'pickups', label: 'Open pickups and chapters held back' },
  { id: 'delivery', label: 'Delivery check and chapter readiness' },
  { id: 'money', label: 'Contracted amount and effective rate' },
];

/** What the dialog opens with: every section but the money one, which stays out unless the narrator ticks it. */
export const DEFAULT_INCLUDE: ProductionReportInclude = { words: true, stages: true, milestones: true, pickups: true, delivery: true, money: false };
