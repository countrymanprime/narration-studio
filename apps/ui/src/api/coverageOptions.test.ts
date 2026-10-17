import { describe, expect, it } from 'vitest';
import { coverageStartOptions } from './coverageOptions';

describe('coverageStartOptions', () => {
  it('sends nothing for no options', () => {
    expect(coverageStartOptions(undefined)).toEqual({});
    expect(coverageStartOptions({})).toEqual({});
  });

  it('keeps the two options older callers send', () => {
    expect(coverageStartOptions({ skipRecheck: true, model: 'tiny' })).toEqual({ skipRecheck: 'true', model: 'tiny' });
    expect(coverageStartOptions({ skipRecheck: false })).toEqual({});
  });

  it('writes the second pass and the parallel run as the host reads them', () => {
    expect(
      coverageStartOptions({
        model: 'tiny',
        recheck: true,
        recheckModel: 'large-v3-turbo',
        recheckBelow: 0.35,
        workers: 3,
        chunkSeconds: 120,
        overlapSeconds: 8,
        chapters: 2,
      }),
    ).toEqual({
      model: 'tiny',
      recheck: 'true',
      recheckModel: 'large-v3-turbo',
      recheckBelow: '0.35',
      workers: '3',
      chunkSeconds: '120',
      overlapSeconds: '8',
      chapters: '2',
    });
  });

  it('sends a false second pass and a zero, which are choices and not absences', () => {
    expect(coverageStartOptions({ recheck: false, workers: 0, chunkSeconds: 0, recheckBelow: 0 })).toEqual({
      recheck: 'false',
      workers: '0',
      chunkSeconds: '0',
      recheckBelow: '0',
    });
  });
});
