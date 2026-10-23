import type { WorkspacePeaks } from '../../../api/contracts/workspace';

/** A span of speech: seconds on the clock of the file the peaks were read from. */
export type Said = readonly [from: number, to: number];

/**
 * A peaks entry covering `[start, start + length)` of a file at 100 buckets a second: loud (`loud`) under the `speech` spans and quiet (`quiet`)
 * elsewhere, so a test can read where the speech is from the columns alone.
 */
export function speechPeaks(start: number, length: number, speech: readonly Said[], loud = 100, quiet = 3): WorkspacePeaks {
  const bps = 100;
  const buckets = Math.round(length * bps);
  const bytes = new Int8Array(buckets * 2);
  for (let k = 0; k < buckets; k += 1) {
    const mid = start + (k + 0.5) / bps;
    const v = speech.some(([a, b]) => mid >= a && mid < b) ? loud : quiet;
    bytes[2 * k] = -v;
    bytes[2 * k + 1] = v;
  }
  return {
    startSeconds: start,
    bucketsPerSecond: bps,
    buckets,
    minMax: btoa(String.fromCharCode(...new Uint8Array(bytes.buffer))),
    sampleRate: 48000,
    channels: 1,
  };
}
