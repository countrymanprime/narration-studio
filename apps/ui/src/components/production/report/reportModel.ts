import type { ProductionPlan, ReportSection } from '../../../api/contracts/production';

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

/** The sections the dialog offers, in the order the host writes them. `money` is the one that is off on open. */
export const REPORT_SECTIONS: readonly { id: ReportSection; label: string }[] = [
  { id: 'words', label: 'Words and finished audio' },
  { id: 'stages', label: 'Hours and readiness by stage' },
  { id: 'milestones', label: 'Deadline and milestones' },
  { id: 'pickups', label: 'Open pickups' },
  { id: 'delivery', label: 'Delivery check' },
  { id: 'money', label: 'Contracted amount and effective rate' },
];

/** Every section but the money one: what a report holds until the narrator ticks the contracted amount. */
export const DEFAULT_SECTIONS: ReadonlySet<ReportSection> = new Set(['words', 'stages', 'milestones', 'pickups', 'delivery']);

/** The ticked sections as the host takes them: in report order, and `money` only when it is offered (a plan with no per-hour amount has none to write). */
export function chosenSections(ticked: ReadonlySet<ReportSection>, moneyOffered: boolean): ReportSection[] {
  return REPORT_SECTIONS.filter(({ id }) => ticked.has(id) && (id !== 'money' || moneyOffered)).map(({ id }) => id);
}
