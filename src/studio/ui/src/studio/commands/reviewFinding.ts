import type { Finding, FindingsApi } from '../../api/contracts/findings';
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
export function reviewFindingCommand(port: ReviewPort, before: Finding, request: ReviewRequest, options: ReviewOptions): Command<Finding> {
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
