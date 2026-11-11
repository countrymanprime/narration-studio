import { describe, expect, it } from 'vitest';
import { describeHeld, shortName } from './draftSentence';

const one = (label: string, many?: (count: number) => string) => ({ label, many });

describe('the sentence that names what is held (#3400)', () => {
  it('names one, two and three drafts', () => {
    expect(describeHeld([one('your changes to Alice')])).toBe('your changes to Alice');
    expect(describeHeld([one('a'), one('b')])).toBe('a and b');
    expect(describeHeld([one('a'), one('b'), one('c')])).toBe('a, b and c');
  });

  it('counts identical drafts instead of chaining them', () => {
    const reply = one('the note you are writing', (n) => `${n} notes you are writing`);
    expect(describeHeld([reply, reply, reply, reply, reply])).toBe('5 notes you are writing');
    expect(describeHeld([reply, reply, one('your edit of a note')])).toBe('2 notes you are writing and your edit of a note');
  });

  it('says how many when there are more than three kinds or the list would be too long', () => {
    expect(describeHeld([one('a'), one('b'), one('c'), one('d')])).toBe('4 unsaved changes');
    expect(describeHeld([one('your changes to a very long entry name indeed, longer than the dialog shows')])).toBe('your unsaved changes');
  });

  it('shortens a long name', () => {
    expect(shortName('Alice')).toBe('Alice');
    expect(shortName('A'.repeat(60))).toHaveLength(28);
    expect(shortName('A'.repeat(60)).endsWith('…')).toBe(true);
  });

  it('keeps the whole sentence short enough for the dialog at 320 x 300', () => {
    const labels = [one(`your changes to ${shortName('B'.repeat(80))}`), one('your edit of a message'), one('the key you pasted')];
    expect(`Save or discard ${describeHeld(labels)} before leaving?`.length).toBeLessThanOrEqual(90);
  });
});
