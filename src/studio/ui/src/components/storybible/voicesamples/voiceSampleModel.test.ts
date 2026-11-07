import { describe, expect, it } from 'vitest';
import type { GuideEntity, GuideType } from '../../../api/contracts/storyBible';
import type { VoiceSample, VoiceSamples } from '../../../api/contracts/voiceSamples';
import { clipProblem, dawBadge, mebibytes, moveChoices, orphanSamples, passageBadge, sampleLength, sampleName, samplesOf } from './voiceSampleModel';

const sample = (over: Partial<VoiceSample> = {}): VoiceSample => ({
  id: 'a'.repeat(32),
  characterId: 'queen',
  label: 'Furious',
  note: '',
  primary: false,
  createdAt: '2026-10-18T09:30:00Z',
  durationMs: 7400,
  bytes: 1000,
  clipState: 'ok',
  source: { chapterId: 'chapter-1', chapterTitle: 'Chapter 1', text: 'Off with his head', startKey: 'p-1:0', endKey: 'p-1:4', state: 'ok' },
  ...over,
});
const list = (samples: VoiceSample[]): VoiceSamples => ({
  samples,
  totals: { count: samples.length, bytes: 0 },
  limits: { minSeconds: 0.5, maxSeconds: 30, perCharacter: 20, projectBytes: 200 * 1024 * 1024, labelUnits: 60, noteUnits: 500 },
});

describe('the length and the size', () => {
  it('writes a length as m:ss, rounded to the second', () => {
    expect([0, 400, 500, 7400, 59_600, 60_000, 125_000, 1_800_000].map(sampleLength)).toEqual([
      '0:00',
      '0:00',
      '0:01',
      '0:07',
      '1:00',
      '1:00',
      '2:05',
      '30:00',
    ]);
    expect(sampleLength(-5)).toBe('0:00');
  });

  it('writes a size in mebibytes, the unit of the project limit', () => {
    expect([0, -1, 1, 52_428, 60_000, 1_048_576, 11_953_766, 200 * 1024 * 1024].map(mebibytes)).toEqual([
      '0 MiB',
      '0 MiB',
      'under 0.1 MiB',
      'under 0.1 MiB',
      '0.1 MiB',
      '1 MiB',
      '11.4 MiB',
      '200 MiB',
    ]);
  });
});

describe('what is wrong with a clip or its passage', () => {
  it('names each state of the clip, and nothing for one that is as saved', () => {
    expect(clipProblem(sample())).toBeUndefined();
    expect(clipProblem(sample({ clipState: 'missing' }))).toEqual({ badge: 'Audio file missing', sentence: 'The audio file is missing.' });
    expect(clipProblem(sample({ clipState: 'size_changed' }))?.badge).toBe('Audio file changed');
    expect(clipProblem(sample({ clipState: 'hash_changed' }))?.sentence).toBe('The audio file changed since it was saved.');
  });

  it('names a passage that moved or a chapter that left, and says the sample still plays', () => {
    const at = (state: VoiceSample['source']['state']) => sample({ source: { ...sample().source, state } });
    expect(passageBadge(at('ok'))).toBeUndefined();
    expect(passageBadge(at('text_changed'))).toMatchObject({ badge: 'Passage changed', hint: expect.stringContaining('still plays') });
    expect(passageBadge(at('chapter_missing'))).toMatchObject({ badge: 'Chapter removed', hint: expect.stringContaining('still plays') });
  });
});

describe('names and groups', () => {
  it('names a sample by its label, or by its character when it has none', () => {
    expect(sampleName(sample(), 'Queen of Hearts')).toBe('Furious');
    expect(sampleName(sample({ label: '   ' }), 'Queen of Hearts')).toBe('Queen of Hearts');
    expect(sampleName(sample({ label: '' }), 'Narration')).toBe('Narration');
  });

  it("lists one character's samples in the host's order", () => {
    const rows = [sample({ id: '1'.repeat(32) }), sample({ id: '2'.repeat(32), characterId: 'hatter' }), sample({ id: '3'.repeat(32) })];
    expect(samplesOf(list(rows), 'queen').map((row) => row.id[0])).toEqual(['1', '3']);
    expect(samplesOf(list(rows), 'nobody')).toEqual([]);
  });

  it('finds the samples of a character who is neither Narration nor an entry that can speak', () => {
    const rows = [
      sample({ id: '1'.repeat(32) }),
      sample({ id: '2'.repeat(32), characterId: 'narration' }),
      sample({ id: '3'.repeat(32), characterId: 'gone' }),
    ];
    expect(orphanSamples(list(rows), new Set(['queen'])).map((row) => row.id[0])).toEqual(['3']);
    expect(orphanSamples(list(rows), new Set(['queen', 'gone']))).toEqual([]);
    // Narration is never an orphan, whatever the set holds.
    expect(orphanSamples(list([rows[1]!]), new Set())).toEqual([]);
  });

  it('offers Narration first, then every speaking entry by name', () => {
    const types: GuideType[] = [
      { name: 'Character', colour: 'green', speaks: true },
      { name: 'Place', colour: 'blue', speaks: false },
    ];
    const entity = (id: string, name: string, category: string) => ({ id, canonical_name: name, category }) as GuideEntity;
    const choices = moveChoices(
      [entity('z', 'Zed', 'Character'), entity('p', 'Garden', 'Place'), entity('a', 'Alice', 'Character'), entity('u', 'Odd', 'Unknown')],
      types,
    );
    expect(choices).toEqual([
      { id: 'narration', name: 'Narration' },
      { id: 'a', name: 'Alice' },
      { id: 'z', name: 'Zed' },
    ]);
    expect(moveChoices([], [])).toEqual([{ id: 'narration', name: 'Narration' }]);
  });
});

describe('a sample kept in the DAW', () => {
  const daw = (state: NonNullable<VoiceSample['daw']>['state']): NonNullable<VoiceSample['daw']> => ({
    state,
    name: 'Voice sample: Queen - Furious [aaaaaa]',
    start: 0,
    end: 0,
  });
  const only = (state: NonNullable<VoiceSample['daw']>['state'], clipState: VoiceSample['clipState']) => sample({ storage: 'daw', daw: daw(state), clipState });

  it('plays while its region is there, moved or not', () => {
    expect(clipProblem(only('ok', 'ok'))).toBeUndefined();
    expect(clipProblem(only('label_moved', 'ok'))).toBeUndefined();
  });

  it('says why it cannot play: the region ended, is not saved yet, has no audio, or the project cannot be read', () => {
    expect(clipProblem(only('label_missing', 'missing'))?.badge).toBe('Region removed');
    expect(clipProblem(only('not_saved', 'missing'))?.badge).toBe('Not saved in REAPER yet');
    expect(clipProblem(only('not_saved', 'missing'))).toMatchObject({ hint: true, sentence: 'Its region is not in the saved REAPER project yet.' });
    // Every reason and hint is a tooltip: one short sentence of at most 80 characters (tests/visual/inFlowProse.test.ts).
    for (const state of ['label_missing', 'not_saved', 'source_missing', 'project_unreadable', 'ok'] as const) {
      const sentence = clipProblem(only(state, 'missing'))?.sentence ?? '';
      expect(sentence.length).toBeLessThanOrEqual(80);
      expect(sentence).not.toMatch(/[.!?;]\s+\S/);
    }
    for (const state of ['label_moved', 'label_missing', 'not_saved', 'source_missing'] as const) {
      const hint = dawBadge(sample({ storage: 'both', daw: daw(state) }))?.hint ?? '';
      expect(hint.length).toBeLessThanOrEqual(80);
      expect(hint).not.toMatch(/[.!?;]\s+\S/);
    }
    expect(clipProblem(only('source_missing', 'missing'))?.badge).toBe('Audio missing');
    expect(clipProblem(only('project_unreadable', 'missing'))?.badge).toBe('Project unreadable');
  });

  it('a copy kept as well still plays, with a badge when its region is not as it was', () => {
    const both = (state: NonNullable<VoiceSample['daw']>['state']) => sample({ storage: 'both', daw: daw(state) });
    expect(clipProblem(both('label_missing'))).toBeUndefined();
    expect(dawBadge(both('ok'))).toBeUndefined();
    expect(dawBadge(both('label_moved'))?.badge).toBe('Region moved');
    expect(dawBadge(both('label_missing'))?.badge).toBe('Region removed');
    expect(dawBadge(both('not_saved'))?.badge).toBe('Not saved in REAPER yet');
    expect(dawBadge(sample())).toBeUndefined();
    expect(dawBadge(only('label_missing', 'missing'))).toBeUndefined();
  });
});
