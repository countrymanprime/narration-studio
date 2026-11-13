import { describe, expect, it } from 'vitest';
import { describeHeld, draftQuestion, shortName, type DraftLabel, type HeldDraft } from './draftSentence';

const one = (label: string, over: Partial<DraftLabel> = {}): DraftLabel => ({ label, ...over });
const held = (label: string, over: Partial<HeldDraft> = {}): HeldDraft => ({ label, saveable: true, ...over });

/** The most characters the whole question may have: it measured two lines of body beside the buttons at 320 x 300 (unsaved-drafts.spec.ts checks it in the browser). */
const WHOLE_SENTENCE = 72;

describe('the sentence that names what is held (#3400)', () => {
  it('names one, two and three drafts', () => {
    expect(describeHeld([one('your changes to Alice')])).toBe('your changes to Alice');
    expect(describeHeld([one('a'), one('b')])).toBe('a and b');
    expect(describeHeld([one('a'), one('b'), one('c')])).toBe('a, b and c');
  });

  it('counts identical drafts instead of chaining them', () => {
    const reply = one('the note you are writing', { many: (n) => `${n} notes you are writing` });
    expect(describeHeld([reply, reply, reply, reply, reply])).toBe('5 notes you are writing');
    expect(describeHeld([reply, reply, one('your edit of a note')], 60)).toBe('2 notes you are writing and your edit of a note');
  });

  it('merges drafts of one kind even when their labels differ (replies that carry a quote, #3404)', () => {
    const many = (n: number) => `${n} replies you are writing`;
    const replies = ['Alice', 'Bob', 'Cy'].map((name) => one(`your reply on “${name}”`, { kind: 'reply', many }));
    expect(describeHeld(replies)).toBe('3 replies you are writing');
  });

  it('falls back to the nameless briefs, then to a count, before it grows past the room', () => {
    const long = one('your changes to a long name indeed here', { brief: 'your entry edit' });
    expect(describeHeld([long])).toBe('your entry edit');
    expect(describeHeld([long, one('your edit of a note that is long', { brief: 'a note edit' })])).toBe('your entry edit and a note edit');
    expect(describeHeld([one('a'), one('b'), one('c'), one('d')])).toBe('4 unsaved changes');
    expect(describeHeld([one('your changes to a very long entry name indeed, longer than the dialog shows')])).toBe('your changes');
  });

  it('shortens a long name, and never cuts inside a character as read', () => {
    expect(shortName('Alice')).toBe('Alice');
    expect(shortName('A'.repeat(60))).toHaveLength(20);
    expect(shortName('A'.repeat(60)).endsWith('…')).toBe(true);
    const family = '👨‍👩‍👧‍👦';
    expect(shortName(family.repeat(30), 5)).toBe(`${family.repeat(4)}…`);
    expect(shortName('é'.repeat(30), 4)).toBe(`${'é'.repeat(3)}…`);
  });
});

describe('the question put to the narrator (#3404)', () => {
  const entry = (name: string) => held(`your changes to ${shortName(name, 16)}`, { brief: 'your entry edit' });

  it('offers Save and Discard when every draft can be saved', () => {
    expect(draftQuestion([entry('Alice')], true)).toEqual({ body: 'Save or discard your changes to Alice before leaving?', canSave: true });
    expect(draftQuestion([entry('Alice')], false).body).toBe('Save or discard your changes to Alice before going on?');
  });

  it('offers only Discard, and no word about saving, when nothing held can be saved', () => {
    const row = held('a relationship you started', { saveable: false });
    expect(draftQuestion([row], true)).toEqual({ body: 'Discard a relationship you started before leaving?', canSave: false });
  });

  it('keeps the saveable draft saveable when another cannot be saved, and names the other as not saved yet, not as discarded (#3400 D1)', () => {
    const row = held('a relationship you started', { brief: 'a relationship', saveable: false });
    const { body, canSave } = draftQuestion([entry('Alice'), row], true);
    expect(canSave).toBe(true);
    expect(body).toBe('Save or discard your entry edit? Not saved yet: a relationship.');
  });

  it('never grows past what the dialog shows at 320 x 300, whatever the names and however many', () => {
    const names = ['B'.repeat(80), 'Bartholomew Fitzwilliam Montgomery-Smythe', '李'.repeat(60), 'x'];
    const labels = (name: string): HeldDraft[] => [
      entry(name),
      held(`the new entry “${shortName(name, 18)}”`, { brief: 'a new entry', saveable: false }),
      held(`your reply on “${shortName(name, 18)}”`, { brief: 'your reply', kind: 'reply', many: (n) => `${n} replies you are writing` }),
      held(`your “${shortName(name, 13)}” pronunciation`, { brief: 'your pronunciation', kind: 'say' }),
      held('your credit template edit'),
      held('the key you pasted'),
    ];
    for (const name of names) {
      for (let count = 1; count <= 6; count += 1) {
        for (const leaving of [true, false]) {
          const drafts = labels(name).slice(0, count);
          for (const subset of [
            drafts,
            drafts.map((draft) => ({ ...draft, saveable: false })),
            drafts.map((draft, i) => ({ ...draft, saveable: i % 2 === 0 })),
          ]) {
            const { body } = draftQuestion(subset, leaving);
            expect([...body].length, body).toBeLessThanOrEqual(WHOLE_SENTENCE);
          }
        }
      }
    }
  });
});
