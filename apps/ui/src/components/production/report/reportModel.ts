import type { ProductionPlan } from '../../../api/contracts/production';

export type ReportFormat = 'html' | 'json';

/**
 * The contracted amount is offered only when the plan pays per finished hour and an amount is set: royalty share and none carry no
 * figure (SNP-Q4). A plan saved before the payment type was recorded only ever paid per hour (ADR 0800), so an absent type counts.
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
