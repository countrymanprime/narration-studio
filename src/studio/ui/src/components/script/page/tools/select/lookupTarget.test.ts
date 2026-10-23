import { describe, expect, it } from 'vitest';
import type { GuideEntity } from '../../../../../api/contracts/storyBible';
import { lookupTarget } from './lookupTarget';

const entry = { id: 'e1', canonical_name: 'The Duchess', aliases: [{ text: 'Her Grace' }], category: 'Character' } as unknown as GuideEntity;

describe('lookupTarget', () => {
  it('opens the entry a name or an alias names, whatever its case', () => {
    expect(lookupTarget('the duchess', [entry])).toEqual({ tab: 'bible', entryId: 'e1' });
    expect(lookupTarget(' Her Grace ', [entry])).toEqual({ tab: 'bible', entryId: 'e1' });
  });
  it('shows the word card for a single word that is no entry, by its key', () => {
    expect(lookupTarget('Tired', [entry])).toEqual({ tab: 'pron', word: 'tired' });
  });
  it('offers several words that are no entry as a new one in the Bible tab', () => {
    expect(lookupTarget(' the White Rabbit ', [entry])).toEqual({ tab: 'bible', miss: 'the White Rabbit' });
  });
});
