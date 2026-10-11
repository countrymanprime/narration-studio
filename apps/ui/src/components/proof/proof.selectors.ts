import type { FindingsSummary } from '../../api/contracts/findings';

/** The two counters and the percent the Proof page, the rail badge and the companion all read (ADR 0793). */
export type ProofProgress = { decided: number; cleared: number; total: number; open: number; percent: number };

/**
 * The one definition of "cleared": a note is open until it is dismissed (a waive is a dismissal with reason `waived`), so
 * `open` is the host's total less its cleared count, plus the pickups REAPER still reports open. `percent` is the cleared
 * share of all notes, 0 for an empty queue, and never 100 while anything is open.
 */
export function proofProgress(summary: Pick<FindingsSummary, 'total' | 'decided' | 'cleared'>, openPickups: number): ProofProgress {
  const { total, decided, cleared } = summary;
  const open = Math.max(0, total - cleared) + Math.max(0, openPickups);
  const share = total > 0 ? Math.round((cleared / total) * 100) : 0;
  return { decided, cleared, total, open, percent: open > 0 ? Math.min(share, 99) : share };
}
