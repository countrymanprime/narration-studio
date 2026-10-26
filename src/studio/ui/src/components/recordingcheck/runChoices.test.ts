import { describe, expect, it } from 'vitest';
import type { CoverageEngines } from '../../api/contracts/coverage';
import { chunkLabel, runProblem, runSummary, startChoices, startOptions, withChoice, workerChoices, type RunChoices } from './runChoices';

const engines: CoverageEngines = {
  default: 'small',
  defaults: { recheck: false, recheckModel: 'large-v3-turbo', recheckBelow: 0.5, workers: 0, chunkSeconds: 300, overlapSeconds: 6, chapters: 1 },
  engines: [
    { id: 'tiny', label: 'Tiny', family: 'whisper', installState: 'installed' },
    { id: 'small', label: 'Small', family: 'whisper', installState: 'installed' },
    { id: 'large-v3-turbo', label: 'Large v3 Turbo', family: 'whisper', installState: 'installed' },
    { id: 'large-v3', label: 'Large v3', family: 'whisper', installState: 'not_installed' },
  ],
};
const base = startChoices(engines);

describe('startChoices', () => {
  it('begins at what the host would do with no options', () => {
    expect(base).toEqual({
      model: 'small',
      recheck: false,
      recheckModel: 'large-v3-turbo',
      recheckBelow: 0.5,
      workers: 0,
      chunkSeconds: 300,
      overlapSeconds: 6,
      chapters: 1,
    });
  });
});

describe('startOptions', () => {
  it('names every choice so the host runs what the dialog showed', () => {
    expect(startOptions(base)).toEqual({ model: 'small', recheck: false, workers: 0, chunkSeconds: 300, overlapSeconds: 6, chapters: 1 });
  });

  it('adds the second pass only when it is on', () => {
    expect(startOptions({ ...base, recheck: true })).toEqual({
      model: 'small',
      recheck: true,
      recheckModel: 'large-v3-turbo',
      recheckBelow: 0.5,
      workers: 0,
      chunkSeconds: 300,
      overlapSeconds: 6,
      chapters: 1,
    });
  });

  it('runs a whole item in one process, since workers share chunks', () => {
    expect(startOptions({ ...base, workers: 4, chunkSeconds: 0 })).toMatchObject({ workers: 1, chunkSeconds: 0 });
  });
});

describe('workerChoices', () => {
  it('offers automatic, then each count up to the computer’s processors', () => {
    expect(workerChoices(4)).toEqual([0, 1, 2, 3, 4]);
    expect(workerChoices(16)).toEqual([0, 1, 2, 3, 4, 6, 8, 12, 16]);
  });

  it('always offers at least one process', () => {
    expect(workerChoices(0)).toEqual([0, 1]);
    expect(workerChoices(Number.NaN)).toEqual([0, 1]);
  });
});

describe('withChoice', () => {
  it('keeps a value a setting holds even when it is not in the list', () => {
    expect(withChoice([60, 300], 120)).toEqual([60, 120, 300]);
    expect(withChoice([60, 300], 60)).toEqual([60, 300]);
  });
});

describe('chunkLabel', () => {
  it('says whole, minutes and seconds', () => {
    expect([0, 45, 60, 300, 90].map(chunkLabel)).toEqual(['Each item whole', '45 s', '1 min', '5 min', '1 min 30 s']);
  });
});

describe('runProblem', () => {
  it('has none for installed models', () => {
    expect(runProblem({ ...base, recheck: true }, engines)).toBeUndefined();
  });

  it('names a first-pass model that is not installed', () => {
    expect(runProblem({ ...base, model: 'large-v3' }, engines)).toBe('Download Large v3 in Settings first.');
    expect(runProblem({ ...base, model: 'gone' }, engines)).toBe('Choose a speech model.');
  });

  it('names a larger model that is not installed, only when the second pass is on', () => {
    const choices: RunChoices = { ...base, recheckModel: 'large-v3' };
    expect(runProblem(choices, engines)).toBeUndefined();
    expect(runProblem({ ...choices, recheck: true }, engines)).toBe('Download Large v3 in Settings first.');
  });

  it('refuses a second pass by the same model as the first, which would find nothing new', () => {
    expect(runProblem({ ...base, recheck: true, recheckModel: 'small' }, engines)).toBe('Choose a different model to re-check with.');
  });
});

describe('runSummary', () => {
  it('says the model, the chunks and the processes', () => {
    expect(runSummary({ ...base, workers: 4 }, engines)).toBe('Small in 5 min chunks that overlap by 6 s, 4 at a time.');
  });

  it('says automatic and whole', () => {
    expect(runSummary(base, engines)).toBe('Small in 5 min chunks that overlap by 6 s, as many at a time as Automatic plans.');
    expect(runSummary({ ...base, chunkSeconds: 0 }, engines)).toBe('Small over each recording whole, one process.');
    expect(runSummary({ ...base, workers: 1 }, engines)).toBe('Small in 5 min chunks that overlap by 6 s, one at a time.');
  });

  it('says how many chapters go at once', () => {
    expect(runSummary({ ...base, workers: 2, chapters: 3 }, engines)).toBe('Small in 5 min chunks that overlap by 6 s, 2 at a time. Up to 3 chapters at once.');
  });

  it('adds the second pass with what it takes', () => {
    expect(runSummary({ ...base, workers: 2, recheck: true }, engines)).toBe(
      'Small in 5 min chunks that overlap by 6 s, 2 at a time. Then Large v3 Turbo re-checks what is missing and words scored under 50%.',
    );
    expect(runSummary({ ...base, workers: 2, recheck: true, recheckBelow: 0 }, engines)).toContain('Then Large v3 Turbo re-checks what is missing.');
  });
});
