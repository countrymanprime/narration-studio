// The browser mock's item gain. levelMatchPreview/levelMatchApply hold their own small, self-contained fixture of gain
// candidates, since nothing else in the mock measures REAPER item levels.
import type { CleanupActionApi, GainCandidate } from '../types';
import { wireClone } from './mockFixtures';

export type CleanupActionSeed = {
  /** The gain candidates levelMatchPreview offers before any levelMatchApply call. */
  gainCandidates?: GainCandidate[];
};

const DEFAULT_GAIN_CANDIDATES: GainCandidate[] = [{ itemGuid: '{99990001-0000-4000-8000-000000000001}', deltaDb: 2.4 }];

export function createCleanupActionMock(seed?: CleanupActionSeed): CleanupActionApi {
  let gainCandidates = wireClone(seed?.gainCandidates ?? DEFAULT_GAIN_CANDIDATES);

  return {
    levelMatchPreview: async () => {
      if (gainCandidates.length === 0) throw new Error("no item on this chapter's linked track needs a gain change");
      return { candidates: wireClone(gainCandidates) };
    },
    levelMatchApply: async () => {
      if (gainCandidates.length === 0) throw new Error("no item on this chapter's linked track needs a gain change");
      const changed = gainCandidates.map((candidate) => ({
        itemGuid: candidate.itemGuid,
        beforeVolume: 1,
        afterVolume: 10 ** (candidate.deltaDb / 20),
      }));
      gainCandidates = [];
      return { changed, stale: [] };
    },
  };
}
