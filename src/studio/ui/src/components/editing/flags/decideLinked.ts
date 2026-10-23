import type { Finding, FindingReviewStatus, FindingsApi } from '../../../api/contracts/findings';
import { apiErrorMessage } from '../../../api/errorMessage';

/** A finding Editing decided: as it was, and as the host answered. */
export type LinkedChange = { before: Finding; after: Finding };

/**
 * Writes `status` on each finding Editing's words reach (`findingsAt`), through the same `FindingsReview` Proof decides with, so the
 * note on Proof and the line on Pickups follow (research note A2). Each goes with its own evidence version and keeps its note; one
 * already at `status` is left alone. A refusal (the check ran again since) does not stop the others: `failed` is the host's sentence.
 */
export async function decideLinked(
  port: Pick<FindingsApi, 'findingsReview'>,
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
export async function restoreLinked(port: Pick<FindingsApi, 'findingsReview'>, changed: readonly LinkedChange[]): Promise<void> {
  for (const { before, after } of changed) {
    await port.findingsReview({ id: before.id, evidenceVersion: after.evidence_version ?? '', status: before.review.status, note: before.review.note ?? '' });
  }
}
