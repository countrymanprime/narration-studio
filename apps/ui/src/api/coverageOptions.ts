import type { CoverageStartOptions } from './contracts/coverage';

/** A recording check's options as the host reads them: its options map holds strings only, and an option left out is the host's setting.
 * `recheck: false` and the zeros are choices ("no second pass", "automatic workers", "each item whole"), so they are sent. */
export function coverageStartOptions(options: CoverageStartOptions | undefined): Record<string, string> {
  const sent: Record<string, string> = {};
  if (!options) return sent;
  if (options.skipRecheck) sent.skipRecheck = 'true';
  if (options.model) sent.model = options.model;
  if (options.recheck !== undefined) sent.recheck = String(options.recheck);
  if (options.recheckModel) sent.recheckModel = options.recheckModel;
  for (const key of ['recheckBelow', 'workers', 'chunkSeconds', 'overlapSeconds', 'chapters'] as const) {
    const value = options[key];
    if (value !== undefined) sent[key] = String(value);
  }
  return sent;
}
