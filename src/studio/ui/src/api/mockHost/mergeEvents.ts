// What the browser mock's Story Bible tells the rest of the mock when entries merge, so the voice samples follow the merge as the
// host's GuideMerge and GuideUnmerge bindings make them (apps/desktop/bindings_voicesamples.go, followMerge and unfollowMerge). It is
// not a port: no page sees it.
export type MergeEvents = {
  /** The Story Bible merged `sourceId` into `targetId` and answered `undoId`. */
  merged(undoId: string, sourceId: string, targetId: string): void;
  /** The Story Bible took the merge `undoId` back. */
  unmerged(undoId: string): void;
  onMerged(listener: (undoId: string, sourceId: string, targetId: string) => void): void;
  onUnmerged(listener: (undoId: string) => void): void;
};

export function createMergeEvents(): MergeEvents {
  const merged: Array<(undoId: string, sourceId: string, targetId: string) => void> = [];
  const unmerged: Array<(undoId: string) => void> = [];
  return {
    merged: (undoId, sourceId, targetId) => merged.forEach((listener) => listener(undoId, sourceId, targetId)),
    unmerged: (undoId) => unmerged.forEach((listener) => listener(undoId)),
    onMerged: (listener) => void merged.push(listener),
    onUnmerged: (listener) => void unmerged.push(listener),
  };
}
