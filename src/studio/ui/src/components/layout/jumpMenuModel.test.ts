import { describe, expect, it } from 'vitest';
import { rankEntries, type Entry } from './jumpMenuModel';

// An Arabic name, written with escapes so no right-to-left character sits in the source.
const NAME = '\u0625\u0631\u064A\u0643';
const isolated = `\u2068${NAME}\u2069`;
const command = (title: string): Entry => ({ id: title, group: 'Undo', groupName: 'Undo', title, source: 'command', run: () => {} }) as Entry;

const rank = (term: string, commands: Entry[]) =>
  rankEntries({ page: [], hits: [], commands, term, pageOnly: false, commandsOnly: false }).map((entry) => entry.title);

describe('the Jump menu matches across the isolates round a narrator name (#4129)', () => {
  const replaced = command(`Undo: Replaced 2 words with ${isolated}'s audio`);
  const reviewed = command(`Undo: Reviewed \u201C${isolated}\u201D`);

  it('finds an Undo row by the name with its apostrophe or its quotes', () => {
    expect(rank(`${NAME}'s`, [replaced, reviewed])).toEqual([replaced.title]);
    expect(rank(`\u201C${NAME}\u201D`, [replaced, reviewed])).toEqual([reviewed.title]);
  });

  it('ignores direction marks in the typed term: a term pasted from a History row or typed with a mark still matches', () => {
    expect(rank(`${isolated}'s`, [replaced, reviewed])).toEqual([replaced.title]);
    expect(rank(`\u200F${NAME}\u200E's`, [replaced, reviewed])).toEqual([replaced.title]);
    expect(rank(`\u202E${NAME}`, [replaced, reviewed]).length).toBe(2);
  });

  it('ranks a title that starts with the term first, isolates ignored', () => {
    const other = command('Go to Undo history');
    expect(rank('undo:', [other, replaced])).toEqual([replaced.title]);
    const lead = command(`${isolated} was recorded`);
    expect(rank(NAME, [other, command(`Take of ${NAME}`), lead])[0]).toBe(lead.title);
  });
});
