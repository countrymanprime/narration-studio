import type { WorkspaceItem, WorkspacePeaks, WorkspacePeaksEntry, WorkspacePeaksResult } from '../../../api/contracts/workspace';
import type { PlaylistSegment } from '../playlist';

/** One item's place on the chapter timeline (seconds from the chapter's start) with its peaks, or none. */
export type PeaksSegment = { itemGuid: string; start: number; end: number; entry?: WorkspacePeaksEntry };

const decoded = new WeakMap<object, Int8Array>();

/** Decodes a WorkspacePeaks' base64 minMax into signed bytes: index 2k and 2k+1 are bucket k's minimum and maximum, each in -127..127. */
function decodeMinMax(peaks: Pick<WorkspacePeaks, 'minMax'>): Int8Array {
  const cached = decoded.get(peaks as object);
  if (cached) return cached;
  const binary = atob(peaks.minMax);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const result = new Int8Array(bytes.buffer);
  decoded.set(peaks as object, result);
  return result;
}

/** The bucket covering `fraction` (0..1) of the buckets: its minimum and maximum. [0, 0] for an empty decode. */
function bucketAt(decoded: Int8Array, buckets: number, fraction: number): readonly [number, number] {
  if (buckets <= 0) return [0, 0];
  const index = Math.max(0, Math.min(buckets - 1, Math.floor(fraction * buckets)));
  return [decoded[2 * index], decoded[2 * index + 1]];
}

/**
 * Lays the items' peaks end to start on the chapter timeline by their played ranges. An item's guid resolves to its alignment index, and
 * that to its peaks entry. An item with no peaks (or whose entry has a reason) keeps its slot, so it draws a flat line and not a gap.
 */
export function joinPeaks(playlist: readonly PlaylistSegment[], items: readonly WorkspaceItem[], peaks: WorkspacePeaksResult | undefined): PeaksSegment[] {
  const entryByIndex = new Map((peaks?.items ?? []).map((entry) => [entry.index, entry] as const));
  const indexByGuid = new Map(items.map((item) => [item.itemGuid, item.index] as const));
  return playlist.map((segment) => {
    const index = indexByGuid.get(segment.itemGuid);
    return {
      itemGuid: segment.itemGuid,
      start: segment.elapsedStart,
      end: segment.elapsedEnd,
      entry: index === undefined ? undefined : entryByIndex.get(index),
    };
  });
}

/** The chapter's length: where the last item ends. */
export const joinedDuration = (segments: readonly PeaksSegment[]): number => segments.reduce((end, segment) => Math.max(end, segment.end), 0);

export type Bar = { x: number; low: number; high: number; flat: boolean };

/**
 * One bar per pixel column across `from`..`to` seconds, as fractions -1..1 of the centreline half-height. A column inside an item
 * with peaks takes that bucket; one inside an item with none, or in a gap between items, is flat.
 */
export function barsFor(segments: readonly PeaksSegment[], from: number, to: number, columns: number): Bar[] {
  const out: Bar[] = [];
  if (to <= from || columns <= 0) return out;
  for (let x = 0; x < columns; x += 1) {
    const t = from + ((x + 0.5) / columns) * (to - from);
    const segment = segments.find((s) => t >= s.start && t < s.end);
    const peaks = segment?.entry?.peaks;
    if (!segment || !peaks) {
      out.push({ x, low: 0, high: 0, flat: true });
      continue;
    }
    const [low, high] = bucketAt(decodeMinMax(peaks), peaks.buckets, (t - segment.start) / (segment.end - segment.start || 1));
    out.push({ x, low: low / 127, high: high / 127, flat: false });
  }
  return out;
}
