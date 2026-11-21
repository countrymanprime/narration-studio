import { describe, expect, it } from 'vitest';
import type { GuideDialogueCue, GuideEntity } from '../../types';
import { guideDialogueCuesSchema } from '../schemas/storyBible';
import { suggestUnknownSpeakers } from './speakerFallbackFake';

const cue = (id: string, chapterId: string, speaker: string | null, extra: Partial<GuideDialogueCue> = {}): GuideDialogueCue => ({
  id,
  chapterId,
  paragraphId: `p-${id}`,
  quote_start: 0,
  quote_end: 4,
  quote_text: `Line ${id}`,
  speaker_entity_id: speaker,
  speaker_source: speaker ? 'tag' : 'unknown',
  evidence: { chapterId, paragraphId: `p-${id}`, excerpt: `Line ${id}`, tag: '' },
  corrected: false,
  ...extra,
});
const entity = (id: string, name: string) => ({ id, canonical_name: name, category: 'Character', aliases: [] }) as unknown as GuideEntity;
const speakers = [entity('ada', 'Ada'), entity('bo', 'Bo')];
const on = { on: true, maxLines: 20 };

describe('the mock local model for unknown speakers', () => {
  const cues = [cue('1', 'c1', 'ada'), cue('2', 'c1', null), cue('3', 'c1', 'bo'), cue('4', 'c1', null), cue('5', 'c2', null)];

  it('asks nothing while the setting is off', () => {
    const run = suggestUnknownSpeakers(cues, speakers, { on: false, maxLines: 20 });
    expect(run).toEqual({ cues, filled: 0, note: '' });
  });

  it('gives each unknown line the nearest speaker, an earlier line first, as a suggestion with a reason the schema takes', () => {
    const run = suggestUnknownSpeakers(cues, speakers, on);
    expect(run.cues.map((row) => [row.id, row.speaker_entity_id, row.speaker_source, row.evidence.reason])).toEqual([
      ['1', 'ada', 'tag', undefined],
      ['2', 'ada', 'local-model', 'Ada speaks the nearest attributed line.'],
      ['3', 'bo', 'tag', undefined],
      ['4', 'bo', 'local-model', 'Bo speaks the nearest attributed line.'],
      ['5', 'bo', 'local-model', 'Bo speaks the nearest attributed line.'],
    ]);
    expect(run.filled).toBe(3);
    expect(run.note).toBe('');
    expect(run.cues.every((row) => !row.corrected)).toBe(true);
    expect(() => guideDialogueCuesSchema.parse(run.cues)).not.toThrow();
    expect(suggestUnknownSpeakers(cues, speakers, on)).toEqual(run);
    // No earlier line has a speaker: the nearest later one is taken; with none anywhere, the line stays unknown.
    expect(suggestUnknownSpeakers([cue('1', 'c1', null), cue('2', 'c2', 'ada'), cue('3', 'c1', 'bo')], speakers, on).cues[0]?.speaker_entity_id).toBe('ada');
    expect(suggestUnknownSpeakers([cue('1', 'c1', null)], speakers, on)).toMatchObject({ filled: 0, note: '' });
  });

  it('never takes a line the narrator confirmed or cleared, or names an entry that cannot speak', () => {
    const chosen = [
      cue('1', 'c1', 'ada'),
      cue('2', 'c1', null, { corrected: true, speaker_source: 'correction' }),
      cue('3', 'c1', null, { speaker_source: 'correction' }),
    ];
    expect(suggestUnknownSpeakers(chosen, speakers, on)).toEqual({ cues: chosen, filled: 0, note: '' });
    const place = [cue('1', 'c1', 'hall'), cue('2', 'c1', null)];
    expect(suggestUnknownSpeakers(place, speakers, on).filled).toBe(0);
  });

  it('asks about no more lines than the cap and says how many it left', () => {
    const run = suggestUnknownSpeakers(cues, speakers, { on: true, maxLines: 1 });
    expect(run.filled).toBe(1);
    expect(run.cues[3]?.speaker_entity_id).toBeNull();
    expect(run.note).toBe('The local model was asked about 1 of the 3 lines the rules left unknown; run it again for the rest.');
  });
});
