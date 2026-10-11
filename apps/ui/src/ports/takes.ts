import type { TakeEvidenceResult } from '../api/contracts/takeEvidence';
import { createTakeEvidenceMock } from '../api/takeEvidenceMock';
import type { NarrationApi } from '../types';

// The takes port (SNE-5a, ADR 0140): what each take of a passage offers as evidence, one entry per take the workspace's
// `workspaceTakes` offers for the same passage, with its id. It reads only: it measures nothing new on the page and
// starts no job. Listing and choosing the takes stay on the workspace port.

export interface TakesPort {
  /** The evidence of every take offered for the passage [firstToken, lastToken] of the chapter. Rejects a chapter or a
   * range the workspace's takes refuse, with the same sentence. */
  evidence(chapterId: string, firstToken: number, lastToken: number): Promise<TakeEvidenceResult>;
}

/** The `NarrationApi` method the host adapter calls. */
export type TakesHostApi = Pick<NarrationApi, 'workspaceTakeEvidence'>;

/** Reads `workspaceTakeEvidence`. */
export function createHostTakes(api: TakesHostApi): TakesPort {
  return { evidence: (chapterId, firstToken, lastToken) => api.workspaceTakeEvidence(chapterId, firstToken, lastToken) };
}

/** The mock: the browser mock's evidence (api/takeEvidenceMock.ts) over the takes `api.workspaceTakes` offers. */
export function createMockTakes(api: Pick<NarrationApi, 'workspaceTakes'>): TakesPort {
  return createHostTakes(createTakeEvidenceMock(api));
}
