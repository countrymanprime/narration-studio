import { describe, expect, it } from 'vitest';
import { sampleSpeakerById, sampleSpeakers } from './speakers';

describe('sample-speakers-are-data', () => {
  it('holds unique ids, codes and names', () => {
    for (const key of ['id', 'code', 'name'] as const) {
      const values = sampleSpeakers.map((speaker) => speaker[key]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('writes every code as an uppercase tag', () => {
    for (const speaker of sampleSpeakers) expect(speaker.code).toBe(speaker.code.toUpperCase());
  });

  it('looks a speaker up by id', () => {
    expect(sampleSpeakerById('alice')?.name).toBe('Alice');
    expect(sampleSpeakerById('nobody')).toBeUndefined();
  });
});
