// The browser mock's Story Bible extraction suggestions: a few of the Studio Next mock's RULES_FINDINGS, as a scan leaves them, over a
// small Story Bible kept in memory. It decides the way apps/desktop/bindings_extraction.go does: accept applies (an edited text trimmed and
// applied as given), reject takes back and keeps a tombstone, review makes an automatic acceptance the narrator's, reopen puts a decided
// suggestion back to the status the rule gave it, and a refusal (an unknown id, a locked entry, a name another entry owns) rejects with the
// host's sentence and changes nothing. Offline: nothing is scanned and nothing is fetched.
import { SUGGESTION_TEXT_MAX_BYTES } from './contracts/extraction';
import type { ExtractionApi, ExtractionDecision, ExtractionSuggestion, SuggestionKind, SuggestionPayload, SuggestionStatus } from './contracts/extraction';
import { wireClone } from './mockFixtures';

type MockEntry = { id: string; name: string; aliases: string[]; locked: boolean; flagged: boolean };

/** The lines the fixture suggestions quote, from Alice's Adventures in Wonderland (public domain). */
const LINES: Record<string, string> = {
  '3-4': 'Then the Dodo solemnly presented the thimble, saying “We beg your acceptance of this elegant thimble.”',
  '3-3': 'At last the Mouse, who seemed to be a person of some authority among them, called out “Sit down, all of you!”',
  '5-1': 'At last the Caterpillar took the hookah out of its mouth, and addressed her in a languid, sleepy voice.',
  '5-4': '“What do you mean by that?” said the Caterpillar sternly. “Explain yourself!”',
  '8-12': 'Alice recognised the White Rabbit: it was talking in a hurried nervous manner, smiling at everything that was said.',
  '8-13': '“Off with her head!” the Queen shouted at the top of her voice.',
  '9-2': 'Alice was very glad to find her in such a pleasant temper.',
};

const ENTRIES: MockEntry[] = [
  { id: 'alice', name: 'Alice', aliases: [], locked: false, flagged: false },
  { id: 'white-rabbit', name: 'White Rabbit', aliases: [], locked: false, flagged: false },
  { id: 'caterpillar', name: 'Caterpillar', aliases: [], locked: false, flagged: false },
  { id: 'queen-of-hearts', name: 'Queen of Hearts', aliases: ['the Queen'], locked: false, flagged: false },
  { id: 'duchess', name: 'Duchess', aliases: [], locked: true, flagged: false },
  { id: 'the-dodo', name: 'The Dodo', aliases: [], locked: false, flagged: true },
];

const ORDER: Record<SuggestionKind, number> = { entry: 0, alias: 1, relationship: 2, property: 3, claim: 3, speaker: 4 };

function evidence(paragraphId: string, quote: string) {
  const line = LINES[paragraphId] ?? '';
  const start = line.indexOf(quote);
  return start < 0 ? [] : [{ paragraphId, start, end: start + quote.length, text: quote }];
}

const fp = (p: SuggestionPayload): string => {
  const parts: string[] = [p.kind];
  switch (p.kind) {
    case 'entry':
      parts.push(p.name);
      break;
    case 'alias':
      parts.push(p.entry, p.alias);
      break;
    case 'property':
      parts.push(p.entry, p.key, p.value);
      break;
    case 'relationship':
      parts.push(p.entry, p.relation, p.to);
      break;
    case 'claim':
      parts.push(p.entry, p.claim, p.text);
      break;
    case 'speaker':
      parts.push(p.quote, p.speaker);
      break;
  }
  return parts.map((part) => part.toLowerCase()).join('|');
};

type Seed = Pick<ExtractionSuggestion, 'payload' | 'confidence' | 'status'> &
  Partial<Pick<ExtractionSuggestion, 'entryId' | 'reason' | 'unverifiedQuote' | 'applied' | 'chapterId' | 'source'>> & { quote?: [string, string] };

/** One of each kind, between them every status a scan leaves and every reason the rule gives. */
const SEEDS: Seed[] = [
  {
    payload: { kind: 'entry', name: 'The Dodo', type: 'Character', aliases: ['Dodo'], description: 'Presents the thimble as the prize.' },
    confidence: 0.91,
    status: 'accepted-auto',
    entryId: 'the-dodo',
    applied: { entryId: 'the-dodo', created: true },
    quote: ['3-4', 'Then the Dodo solemnly presented the thimble'],
  },
  {
    payload: { kind: 'entry', name: 'The Mouse', type: 'Character', aliases: ['Mouse'], description: 'Calls the party to sit down and dry off.' },
    confidence: 0.62,
    status: 'needs-verification',
    reason: 'Confidence is under the threshold.',
    quote: ['3-3', 'the Mouse, who seemed to be a person of some authority'],
  },
  {
    payload: { kind: 'alias', entry: 'White Rabbit', alias: 'Rabbit' },
    confidence: 0.66,
    status: 'needs-verification',
    entryId: 'white-rabbit',
    reason: 'Confidence is under the threshold.',
    quote: ['8-12', 'Alice recognised the White Rabbit'],
  },
  {
    payload: { kind: 'alias', entry: 'White Rabbit', alias: 'the Queen' },
    confidence: 0.4,
    status: 'needs-verification',
    entryId: 'white-rabbit',
    reason: 'Confidence is under the threshold.',
  },
  {
    payload: { kind: 'property', entry: 'Caterpillar', key: 'Habit', value: 'Smokes a hookah' },
    confidence: 0.93,
    status: 'accepted-auto',
    entryId: 'caterpillar',
    applied: { entryId: 'caterpillar' },
    quote: ['5-1', 'the Caterpillar took the hookah out of its mouth'],
  },
  {
    payload: { kind: 'property', entry: 'Duchess', key: 'Mood', value: 'Pleasant in this chapter' },
    confidence: 0.88,
    status: 'needs-verification',
    entryId: 'duchess',
    reason: 'The entry is locked.',
    quote: ['9-2', 'Alice was very glad to find her in such a pleasant temper'],
  },
  {
    payload: { kind: 'claim', entry: 'Caterpillar', claim: 'talk', text: 'Speaks sternly' },
    confidence: 0.9,
    status: 'accepted',
    entryId: 'caterpillar',
    applied: { entryId: 'caterpillar' },
    quote: ['5-4', 'said the Caterpillar sternly'],
  },
  {
    payload: { kind: 'claim', entry: 'King of Hearts', claim: 'know', text: 'Knows how to manage the Queen' },
    confidence: null,
    status: 'needs-verification',
    reason: 'No confidence was given. No evidence quote. The entry is not in the Story Bible.',
    source: 'imported',
  },
  {
    payload: { kind: 'relationship', entry: 'Alice', to: 'White Rabbit', relation: 'follows' },
    confidence: 0.86,
    status: 'rejected',
    entryId: 'alice',
    source: 'local-model',
  },
  {
    payload: { kind: 'speaker', quote: '“Off with her head!”', speaker: 'Queen of Hearts' },
    confidence: 0.68,
    status: 'needs-verification',
    reason: 'Confidence is under the threshold. quote not found',
    unverifiedQuote: 'Off with his head',
    chapterId: '8',
  },
];

type Ruled = { status: SuggestionStatus; reason?: string };

/** The seeds as stored, and the status the 75% rule gives each, which reopen puts back. */
function seeded(): { suggestions: ExtractionSuggestion[]; ruled: Map<string, Ruled> } {
  const ruled = new Map<string, Ruled>();
  const suggestions = SEEDS.map((seed, i) => {
    const { quote, ...rest } = seed;
    const s: ExtractionSuggestion = {
      id: 's' + (i + 1),
      kind: seed.payload.kind,
      entryId: null,
      evidence: quote ? evidence(quote[0], quote[1]) : [],
      fp: fp(seed.payload),
      source: 'rules',
      createdAt: '2026-10-11T09:00:00Z',
      ...rest,
    };
    const ruledStatus =
      s.status === 'accepted' || s.status === 'rejected' ? (s.confidence !== null && s.confidence >= 0.75 ? 'accepted-auto' : 'needs-verification') : s.status;
    ruled.set(
      s.id,
      ruledStatus === 'needs-verification' ? { status: ruledStatus, reason: s.reason ?? 'Confidence is under the threshold.' } : { status: ruledStatus },
    );
    return s;
  });
  return { suggestions, ruled };
}

const fold = (text: string) => text.trim().toLowerCase();

function withText(p: SuggestionPayload, text: string): SuggestionPayload {
  const t = text.trim();
  switch (p.kind) {
    case 'entry':
      return { ...p, name: t };
    case 'alias':
      return { ...p, alias: t };
    case 'property':
      return { ...p, value: t };
    case 'relationship':
      return { ...p, relation: t };
    case 'claim':
      return { ...p, text: t };
    case 'speaker':
      return { ...p, speaker: t };
  }
}

export function createExtractionMock(): ExtractionApi {
  const seeds = seeded();
  let suggestions = seeds.suggestions;
  let entries = wireClone(ENTRIES);

  const resolve = (ref: string) => entries.find((e) => fold(e.id) === fold(ref) || fold(e.name) === fold(ref) || e.aliases.some((a) => fold(a) === fold(ref)));
  const find = (id: string) => {
    const s = suggestions.find((x) => x.id === id);
    if (!s) throw new Error('That suggestion is gone.');
    return s;
  };
  const lockedOf = (s: ExtractionSuggestion) => entries.find((e) => e.id === (s.applied?.entryId ?? s.entryId))?.locked === true;

  /** Applies a suggestion's payload; returns the entry it touched, or throws the sentence and changes nothing. */
  function applyOne(s: ExtractionSuggestion, flag: boolean): string {
    const p = s.payload;
    if (p.kind === 'entry') {
      const hit = resolve(p.name);
      if (hit?.locked) throw new Error('The entry is locked.');
      if (hit) {
        s.applied = { entryId: hit.id };
        return hit.id;
      }
      const id =
        p.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'entry';
      entries.push({ id, name: p.name, aliases: (p.aliases ?? []).filter((a) => !resolve(a)), locked: false, flagged: flag });
      s.applied = { entryId: id, created: true };
      return id;
    }
    const ref = p.kind === 'speaker' ? p.speaker : p.entry;
    const entry = resolve(ref);
    if (!entry) throw new Error(p.kind === 'speaker' ? `There is no speaking entry “${ref}”.` : 'The entry is not in the Story Bible.');
    if (entry.locked) throw new Error('The entry is locked.');
    if (p.kind === 'alias') {
      const owner = resolve(p.alias);
      if (owner && owner.id !== entry.id) throw new Error(`“${p.alias}” is already a name of ${owner.name}.`);
      if (!owner) entry.aliases.push(p.alias);
      s.applied = { entryId: entry.id, aliases: owner ? [] : [p.alias] };
    } else {
      s.applied = { entryId: entry.id };
    }
    return entry.id;
  }

  function takeBack(s: ExtractionSuggestion): string | undefined {
    const applied = s.applied;
    if (!applied) return undefined;
    const entry = entries.find((e) => e.id === applied.entryId);
    if (entry && applied.created && entry.flagged) entries = entries.filter((e) => e !== entry);
    if (entry && applied.aliases) entry.aliases = entry.aliases.filter((a) => !applied.aliases?.includes(a));
    delete s.applied;
    return applied.entryId;
  }

  /** Runs a decision on a copy, so a refusal leaves everything as it was. */
  function decide(id: string, change: (s: ExtractionSuggestion) => string | undefined): Promise<ExtractionDecision> {
    const savedSuggestions = wireClone(suggestions);
    const savedEntries = wireClone(entries);
    try {
      const s = find(id);
      const touched = change(s);
      return Promise.resolve(wireClone({ suggestion: s, settled: [], entryIds: touched ? [touched] : [] }));
    } catch (error) {
      suggestions = savedSuggestions;
      entries = savedEntries;
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  return {
    extractionList: () => Promise.resolve(wireClone([...suggestions].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]))),
    extractionAccept: (id, text) =>
      decide(id, (s) => {
        if (s.status === 'rejected') throw new Error('That suggestion was rejected, so it cannot be accepted.');
        let touched: string | undefined;
        if (text !== undefined) {
          if (new TextEncoder().encode(text).length > SUGGESTION_TEXT_MAX_BYTES) throw new Error('The text is too long.');
          if (!text.trim()) throw new Error('The text is empty.');
          if (lockedOf(s)) throw new Error('The entry is locked.');
          takeBack(s);
          s.payload = withText(s.payload, text);
        }
        if (!s.applied) touched = applyOne(s, false);
        const entry = entries.find((e) => e.id === s.applied?.entryId);
        if (entry) entry.flagged = false;
        s.entryId = s.applied?.entryId ?? s.entryId;
        s.status = 'accepted';
        delete s.reason;
        return touched ?? s.applied?.entryId;
      }),
    extractionReject: (id) =>
      decide(id, (s) => {
        if (lockedOf(s)) throw new Error('The entry is locked.');
        const touched = takeBack(s);
        s.status = 'rejected';
        delete s.reason;
        return touched;
      }),
    extractionReview: (id) =>
      decide(id, (s) => {
        if (s.status !== 'accepted-auto' || !s.applied) throw new Error('Nothing to review.');
        if (lockedOf(s)) throw new Error('The entry is locked.');
        const entry = entries.find((e) => e.id === s.applied?.entryId);
        if (entry) entry.flagged = false;
        s.status = 'accepted';
        return entry?.id;
      }),
    extractionReopen: (id) =>
      decide(id, (s) => {
        if (s.status !== 'accepted' && s.status !== 'rejected') throw new Error('That suggestion is not decided yet.');
        if (lockedOf(s)) throw new Error('The entry is locked.');
        const ruled = seeds.ruled.get(s.id) ?? { status: 'needs-verification', reason: 'Confidence is under the threshold.' };
        let touched: string | undefined;
        if (ruled.status === 'accepted-auto') {
          touched = s.applied ? s.applied.entryId : applyOne(s, true);
          const entry = entries.find((e) => e.id === s.applied?.entryId);
          if (entry && s.applied?.created) entry.flagged = true;
        } else {
          touched = takeBack(s);
        }
        s.status = ruled.status;
        if (ruled.reason) s.reason = ruled.reason;
        else delete s.reason;
        return touched;
      }),
  };
}
