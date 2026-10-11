import type { WorkspaceSnapApi, WorkspaceSnapResult } from './contracts/workspaceSnap';

// The mock's snap: no audio, so a cut moves by a stable offset inside 2 ms, a function of the time alone (the Studio
// Next mock's own rule, docs/research/mockups/studio-next/src/providers/alignment.ts), so tests are deterministic.

const hashOf = (s: string): number => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
};

/** `sourceTime` moved to the whole millisecond nearest it, then by -2 to +2 ms; never below 0, never more than 2 ms. */
export function mockSnapTime(sourceTime: number): number {
  const ms = Math.round(sourceTime * 1000);
  const snapped = Math.max(0, (ms + ((hashOf('zc' + ms) % 5) - 2)) / 1000);
  // The rounding to a millisecond can add up to 0.5 ms to the offset: clamp to the 2 ms reach.
  return Math.min(sourceTime + 0.002, Math.max(sourceTime - 0.002, snapped));
}

export function createWorkspaceSnapMock(): WorkspaceSnapApi {
  return {
    workspaceSnap: async (chapterId, itemGuid, sourceTime): Promise<WorkspaceSnapResult> => {
      if (!Number.isFinite(sourceTime) || sourceTime < 0) throw new Error('a cut point is a finite time of at least 0 seconds');
      const time = mockSnapTime(sourceTime);
      return { chapterId, itemGuid, sourceTime, outcome: 'snapped', time, moved: time - sourceTime };
    },
  };
}
