// The golden payload for the series voice bible (ADR 0450: only reference data is shared across a series, no
// acoustic baseline): which schema owns each file in tests/fixtures/contracts/ (see index.ts).
import type { z } from 'zod';
import { seriesVoiceBibleSchema } from '../schemas/series';

export const seriesGoldens: Record<string, z.ZodType> = {
  'series-voice-bible.json': seriesVoiceBibleSchema,
};
