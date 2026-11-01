import type { Finding, FindingReviewStatus, FindingsApi } from '../../api/contracts/findings';
import { apiErrorMessage } from '../../api/errorMessage';
import type { Command, Journal, Result } from '../journal/createJournal';

export type ReviewPort = Pick<FindingsApi, 'findingsReview'>;

/** What a decision says: the finding, the evidence version it was made against, the status and the note. */
export type ReviewRequest = Parameters<ReviewPort['findingsReview']>[0];

export type ReviewOptions = {
  label: string;
  /** Extra journal touches beside the finding itself (the pickup list, for one). */
  touches?: readonly string[];
  /** Runs after Undo has put the earlier decision back, so a page can refresh what it shows. */
  afterUndo?: (back: Finding) => Promise<void> | void;
  /** Keeps the host's own error, so a caller can tell changed evidence from any other refusal. */
  /** The sentence a refusal carries; the host's own message when left out. */
  describe?: (error: unknown) => string;
  onFailure?: (error: unknown) => void;
};

/**
 * The one command that decides a finding (audit cluster 17, docs/research/ui-function-audit.md). Proof's Inspector and Pickups' "Fine"
 * run through it, so each decision is one journal entry that Undo reverses; Undo puts the earlier status and note back against the
 * evidence version the decision returned. A refusal journals nothing and carries the host's sentence.
 */
function reviewFindingCommand(port: ReviewPort, before: Finding, request: ReviewRequest, options: ReviewOptions): Command<Finding> {
  const refuse = (error: unknown): Result<Finding> => {
    options.onFailure?.(error);
    return { ok: false, refusal: { code: 'host_refused', reason: (options.describe ?? apiErrorMessage)(error) } };
  };
  return {
    label: options.label,
    touches: [`proof/finding/${request.id}`, ...(options.touches ?? [])],
    run: async () => {
      try {
        return { ok: true, value: await port.findingsReview(request) };
      } catch (error) {
        return refuse(error);
      }
    },
    undo: async (decided) => {
      try {
        const back = await port.findingsReview({
          id: request.id,
          evidenceVersion: decided.evidence_version ?? '',
          status: before.review.status,
          note: before.review.note ?? '',
        });
        await options.afterUndo?.(back);
        return { ok: true, value: back };
      } catch (error) {
        return refuse(error);
      }
    },
  };
}

/** Decides the finding through the journal. */
export const reviewFinding = (journal: Pick<Journal, 'act'>, port: ReviewPort, before: Finding, request: ReviewRequest, options: ReviewOptions) =>
  journal.act<Finding>(reviewFindingCommand(port, before, request, options));

/** A finding Editing decided: as it was, and as the host answered. */
export type LinkedChange = { before: Finding; after: Finding };

/**
 * Writes `status` on each finding Editing's words reach (`findingsAt`), through the same `FindingsReview` Proof decides with, so the
 * note on Proof and the line on Pickups follow (research note A2). Each goes with its own evidence version and keeps its note; one
 * already at `status` is left alone. A refusal (the check ran again since) does not stop the others: `failed` is the host's sentence.
 */
export async function decideLinked(
  port: ReviewPort,
  linked: readonly Finding[],
  status: FindingReviewStatus,
): Promise<{ changed: LinkedChange[]; failed?: string }> {
  const changed: LinkedChange[] = [];
  let failed: string | undefined;
  for (const before of linked) {
    if (before.review.status === status) continue;
    try {
      const after = await port.findingsReview({ id: before.id, evidenceVersion: before.evidence_version ?? '', status, note: before.review.note ?? '' });
      changed.push({ before, after });
    } catch (error) {
      failed ??= apiErrorMessage(error);
    }
  }
  return { changed, ...(failed ? { failed } : {}) };
}

/** Undo of `decideLinked`: each finding back to the status and note it had, against the version the change answered. */
export async function restoreLinked(port: ReviewPort, changed: readonly LinkedChange[]): Promise<void> {
  for (const { before, after } of changed) {
    await port.findingsReview({ id: before.id, evidenceVersion: after.evidence_version ?? '', status: before.review.status, note: before.review.note ?? '' });
  }
}
