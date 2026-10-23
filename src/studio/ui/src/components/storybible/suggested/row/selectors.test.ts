// The pure selectors of the suggestion row (acceptance 8): no input is changed and the same input gives the same answer.
import { describe, expect, it } from 'vitest';
import type { ExtractionSuggestion, SuggestionPayload } from '../../../../api/contracts/extraction';
import { createExtractionMock } from '../../../../api/extractionMock';
import {
  CLAIM_LABEL,
  VERIFY_BELOW,
  claimsOf,
  confidenceWhy,
  editableText,
  kindLabel,
  pct,
  propertiesOf,
  summaryOf,
  unattached,
  verifyCount,
  verifyOf,
  withText,
} from './selectors';

const payloads: SuggestionPayload[] = [
  { kind: 'entry', name: 'The Dodo', type: 'Character', description: 'Presents the thimble.' },
  { kind: 'alias', entry: 'White Rabbit', alias: 'Rabbit' },
  { kind: 'property', entry: 'Caterpillar', key: 'Habit', value: 'Smokes a hookah' },
  { kind: 'relationship', entry: 'Alice', to: 'White Rabbit', relation: 'follows' },
  { kind: 'claim', entry: 'Alice', claim: 'know', text: 'Knows who she was' },
  { kind: 'speaker', quote: '“Off with her head!”', speaker: 'Queen of Hearts' },
];

let all: ExtractionSuggestion[];
const frozen = <T>(value: T): T => {
  const walk = (v: unknown): void => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      Object.freeze(v);
      Object.values(v).forEach(walk);
    }
  };
  walk(value);
  return value;
};

describe('selectors are pure', () => {
  it('kindLabel names each kind, and a claim by its claim', () => {
    expect(payloads.map(kindLabel)).toEqual(['New entry', 'Name', 'Detail', 'Relationship', 'Knows', 'Speaker']);
    expect(CLAIM_LABEL).toEqual({ talk: 'Says', act: 'Does', know: 'Knows' });
  });

  it('summaryOf says the suggestion in a line', () => {
    expect(payloads.map(summaryOf)).toEqual([
      'The Dodo (Character): Presents the thimble.',
      'Rabbit',
      'Habit: Smokes a hookah',
      'Alice follows White Rabbit',
      'Knows who she was',
      '“Off with her head!” spoken by Queen of Hearts',
    ]);
  });

  it('editableText and withText agree: the text goes in trimmed and comes back out', () => {
    for (const p of payloads) {
      expect(editableText(withText(p, '  Changed  '))).toBe('Changed');
      expect(withText(p, 'x').kind).toBe(p.kind);
    }
  });

  it('does not change what it is given and answers the same twice', async () => {
    all = frozen(await createExtractionMock().extractionList());
    const first = confidenceWhy(all[1]!, { entryName: 'White Rabbit', chapters: 2 });
    for (const p of frozen(payloads)) {
      expect(kindLabel(p)).toBe(kindLabel(p));
      expect(summaryOf(p)).toBe(summaryOf(p));
      withText(p, 'again');
    }
    expect(confidenceWhy(all[1]!, { entryName: 'White Rabbit', chapters: 2 })).toBe(first);
    expect(verifyCount(all)).toBe(verifyCount(all));
    expect(unattached(all)).toEqual(unattached(all));
    expect(claimsOf(all, 'caterpillar', 'talk')).toEqual(claimsOf(all, 'caterpillar', 'talk'));
    expect(propertiesOf(all, 'caterpillar')).toEqual(propertiesOf(all, 'caterpillar'));
  });

  it('pct rounds a confidence to a whole percent', () => {
    expect([0.75, 0.7499, 0.931, 1, 0].map(pct)).toEqual([75, 75, 93, 100, 0]);
  });
});

describe('the review queue over the mock host', () => {
  it('counts what needs verifying, per entry and loose', async () => {
    all = await createExtractionMock().extractionList();
    const needs = all.filter((s) => s.status === 'needs-verification');
    expect(verifyCount(all)).toBe(needs.length);
    expect(verifyOf(all, 'white-rabbit')).toBe(needs.filter((s) => s.entryId === 'white-rabbit').length);
    expect(unattached(all).every((s) => !s.entryId && s.status === 'needs-verification')).toBe(true);
    expect(unattached(all).length).toBeGreaterThan(0);
  });

  it('claimsOf and propertiesOf keep only accepted ones, automatic or the narrator’s', async () => {
    all = await createExtractionMock().extractionList();
    const props = propertiesOf(all, 'caterpillar');
    expect(props.length).toBeGreaterThan(0);
    expect(props.every((s) => s.payload.kind === 'property' && (s.status === 'accepted' || s.status === 'accepted-auto'))).toBe(true);
    expect(claimsOf(all, 'caterpillar', 'talk').every((s) => s.payload.kind === 'claim' && s.payload.claim === 'talk')).toBe(true);
  });
});

describe('confidenceWhy', () => {
  const base = {
    id: 's',
    kind: 'property',
    payload: payloads[2]!,
    entryId: 'caterpillar',
    evidence: [],
    confidence: 0.93,
    source: 'rules',
    status: 'accepted-auto',
    fp: 'f',
    createdAt: 't',
  } as ExtractionSuggestion;
  const quote = [{ paragraphId: '5-1', start: 0, end: 3, text: 'the' }];

  it('says the percent against the threshold, the quote and the mentions', () => {
    const why = confidenceWhy({ ...base, evidence: quote }, { entryName: 'Caterpillar', chapters: 3 });
    expect(VERIFY_BELOW).toBe(0.75);
    expect(why).toContain('93% is at or above 75%, so it was accepted for you.');
    expect(why).toContain('The quote was found in the text.');
    expect(why).toContain('“Caterpillar” is mentioned in 3 chapters.');
  });

  it('says the 75% edge is accepted and just under is not', () => {
    expect(confidenceWhy({ ...base, confidence: 0.75 })).toContain('at or above');
    expect(confidenceWhy({ ...base, confidence: 0.74 })).toContain('74% is under 75%, so you check it.');
  });

  it('says no score was given, a quote that was not found and a missing quote', () => {
    expect(confidenceWhy({ ...base, confidence: null })).toContain('No confidence was given, so you check it.');
    expect(confidenceWhy({ ...base, unverifiedQuote: 'zzz' })).toContain('The quote was not found in the text.');
    expect(confidenceWhy(base)).toContain('It has no quote.');
    expect(confidenceWhy({ ...base, kind: 'entry', payload: payloads[0]! })).not.toContain('It has no quote.');
  });

  it('uses the singular for one chapter and leaves the sentence out without an entry', () => {
    expect(confidenceWhy(base, { entryName: 'Caterpillar', chapters: 1 })).toContain('mentioned in 1 chapter.');
    expect(confidenceWhy(base)).not.toContain('mentioned');
  });
});
