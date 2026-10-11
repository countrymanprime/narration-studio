// The stories' sample data is the mock host's, read through the page's cache.
import { describe, expect, it } from 'vitest';
import { loadSampleScript } from './sampleScript';

describe('loadSampleScript', () => {
  it('holds every list ready, and the first chapter paragraphs', async () => {
    const sample = await loadSampleScript();
    for (const list of [sample.chapters, sample.marks, sample.prep, sample.entries, sample.cues]) expect(list?.status).toBe('ready');
    const first = sample.chapters?.value?.[0];
    expect(sample.paragraphs[first!.id]?.value?.length).toBeGreaterThan(0);
  });
});
